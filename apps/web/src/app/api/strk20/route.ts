import { Account, Contract, RpcProvider, constants } from "starknet";
import {
  ContractDiscoveryProvider,
  type PoolContractInterface,
} from "@starkware-libs/starknet-privacy-sdk/testing";
import { PrivacyPoolABI } from "@starkware-libs/starknet-privacy-sdk/abi";
import {
  Open,
  ProvingServiceProofProvider,
  createPrivateTransfers,
} from "@starkware-libs/starknet-privacy-sdk";
import type { STRK20_ACTION } from "@starknet-io/types-js";

import { applyActions, type Builder } from "@/lib/sdk-actions";

/**
 * Route B — the SDK route, server-side only.
 *
 * This holds a private key and a viewing key, so it must never run in the
 * browser. Keeping it in a route handler means the browser posts an action list
 * and gets back a transaction hash, exactly as it would from a wallet, while the
 * keys stay on the server.
 *
 * Why this route exists at all: the wallet route cannot reach Sepolia (Ready's
 * STRK20 backend returns a 500 there in ~25ms, too fast to have attempted
 * proving), while StarkWare does run a Sepolia proving service. So the two
 * routes cover different networks between them.
 */
export const runtime = "nodejs";
// Proving takes ~30s; the default budget is not enough.
export const maxDuration = 300;

interface Body {
  op?: "prepare" | "invoke";
  actions?: STRK20_ACTION[];
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") throw new Error(`${name} is not configured on the server`);
  return value.trim();
}

function chainIdConstant(chain: string) {
  return chain === "SN_MAIN"
    ? constants.StarknetChainId.SN_MAIN
    : constants.StarknetChainId.SN_SEPOLIA;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const actions = body.actions;
  if (!Array.isArray(actions) || actions.length === 0) {
    return Response.json({ error: "actions must be a non-empty array" }, { status: 400 });
  }
  const op = body.op === "prepare" ? "prepare" : "invoke";

  try {
    const rpcUrl = required("STARKNET_RPC_URL");
    const poolAddress = required("NEXT_PUBLIC_POOL_ADDRESS");
    const chain = process.env.NEXT_PUBLIC_CHAIN_ID ?? "SN_SEPOLIA";

    const provider = new RpcProvider({ nodeUrl: rpcUrl });
    const account = new Account({
      provider,
      address: required("STRK20_SDK_ACCOUNT_ADDRESS"),
      signer: required("STRK20_SDK_PRIVATE_KEY"),
      // Required for accounts sending v3 transactions.
      cairoVersion: "1",
    });

    // The viewing key must be a bigint. A hex string compiles but silently
    // derives the wrong channel keys, and notes never decrypt.
    const viewingKey = BigInt(required("STRK20_SDK_VIEWING_KEY"));

    const transfers = createPrivateTransfers({
      account,
      viewingKeyProvider: { getViewingKey: async () => viewingKey },
      provingProvider: new ProvingServiceProofProvider(
        required("STRK20_PROVING_URL"),
        chainIdConstant(chain),
      ),
      // Read notes straight from the pool contract. The hosted Sepolia indexer is
      // not answering, and this needs no service at all — only an RPC.
      discoveryProvider: new ContractDiscoveryProvider(
        new Contract({
          abi: PrivacyPoolABI,
          address: poolAddress,
          providerOrAccount: provider,
        }) as unknown as PoolContractInterface,
      ),
      poolContractAddress: poolAddress,
    });

    // Anchor the proof a few blocks back so it is not built on a tip that reorgs.
    const provingBlockId = (await provider.getBlockNumber()) - 10;

    // autoRegister bundles the one-time viewing-key registration into the first
    // real operation, so a fresh account does not need a separate round trip.
    const builder = transfers.build({ autoSetup: true, autoRegister: true, provingBlockId });
    applyActions(builder as unknown as Builder, actions, Open);
    (builder as unknown as Builder).surplusTo(account.address);

    if (op === "prepare") {
      // Simulation needs a node of its own for the pool's view call.
      const simulated = await builder.simulate({ node: provider });
      return Response.json({ ok: true, op, simulated: summarise(simulated) });
    }

    const { callAndProof } = await builder.execute();
    const proofDetails = callAndProof.proof.proofFacts?.length
      ? { proofFacts: callAndProof.proof.proofFacts, proof: callAndProof.proof.data }
      : {};
    const tx = await account.execute(callAndProof.call, { tip: 0n, ...proofDetails });
    await provider.waitForTransaction(tx.transaction_hash);

    return Response.json({ ok: true, op, transaction_hash: tx.transaction_hash });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Surface the reason; the server log keeps the stack.
    console.error("[strk20 sdk route]", error);
    return Response.json({ error: message }, { status: 500 });
  }
}

/** Trim the simulate result to something safe and useful to return. */
function summarise(result: unknown): unknown {
  try {
    return JSON.parse(
      JSON.stringify(result, (_key, value) =>
        typeof value === "bigint" ? `0x${value.toString(16)}` : value,
      ),
    );
  } catch {
    return { note: "simulation succeeded but the result was not serialisable" };
  }
}
