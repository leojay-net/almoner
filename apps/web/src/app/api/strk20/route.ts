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

    // Both branches call execute(), which proves but does not submit — the
    // chain is only touched by account.execute() below.
    //
    // Deliberately NOT simulate(): the SDK documents that as fee estimation
    // "without real proof generation", so it succeeds even when the proving
    // service is unreachable. A "test first" that passes against a dead prover
    // is worse than no test at all, and it would not match the wallet route,
    // whose prepare really does prove.
    const { callAndProof } = await builder.execute();

    if (op === "prepare") {
      return Response.json({
        ok: true,
        op,
        proved: true,
        entrypoint: callAndProof.call.entrypoint,
        calldataLength: callAndProof.call.calldata?.length ?? 0,
        proofFacts: callAndProof.proof?.proofFacts?.length ?? 0,
        proofBytes: String(callAndProof.proof?.data ?? "").length,
      });
    }

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
