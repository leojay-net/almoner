#!/usr/bin/env node
/**
 * Proves a deposit without submitting it.
 *
 * The cheapest way to answer "does this route actually work": `builder.execute()`
 * generates a real proof but never touches the chain — submission is a separate
 * `account.execute(callAndProof.call)` that this script deliberately does not
 * make. Nothing is spent, so it is safe against mainnet too.
 *
 * `builder.simulate()` is NOT this test. The SDK documents it as fee estimation
 * "without real proof generation", so it passes even when the proving service is
 * unreachable — which is exactly the failure worth catching.
 *
 *   set -a; . apps/web/.env.local; set +a
 *   node scripts/prove-check.mjs
 */

import { Account, Contract, RpcProvider, constants } from "starknet";
import { ContractDiscoveryProvider } from "@starkware-libs/starknet-privacy-sdk/testing";
import { PrivacyPoolABI } from "@starkware-libs/starknet-privacy-sdk/abi";
import { ProvingServiceProofProvider, createPrivateTransfers } from "@starkware-libs/starknet-privacy-sdk";

const E = process.env;
const need = (n) => {
  const v = E[n];
  if (!v) {
    console.error(`missing ${n} — source apps/web/.env.local first`);
    process.exit(2);
  }
  return v;
};

const chain = E.NEXT_PUBLIC_CHAIN_ID ?? "SN_SEPOLIA";
const poolAddress = need("NEXT_PUBLIC_POOL_ADDRESS");
const provider = new RpcProvider({ nodeUrl: need("STARKNET_RPC_URL") });
const account = new Account({
  provider,
  address: need("STRK20_SDK_ACCOUNT_ADDRESS"),
  signer: need("STRK20_SDK_PRIVATE_KEY"),
  // Required for accounts sending v3 transactions.
  cairoVersion: "1",
});

console.log("account :", account.address);
console.log("pool    :", poolAddress);
console.log("prover  :", need("STRK20_PROVING_URL"));
console.log("chain   :", chain);

const transfers = createPrivateTransfers({
  account,
  // Must be a bigint: a hex string compiles but derives the wrong channel keys.
  viewingKeyProvider: { getViewingKey: async () => BigInt(need("STRK20_SDK_VIEWING_KEY")) },
  provingProvider: new ProvingServiceProofProvider(
    E.STRK20_PROVING_URL,
    chain === "SN_MAIN" ? constants.StarknetChainId.SN_MAIN : constants.StarknetChainId.SN_SEPOLIA,
  ),
  // Reads notes from the pool contract directly — no indexer required, which
  // matters because the hosted Sepolia indexer does not answer.
  discoveryProvider: new ContractDiscoveryProvider(
    new Contract({ abi: PrivacyPoolABI, address: poolAddress, providerOrAccount: provider }),
  ),
  poolContractAddress: poolAddress,
});

const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const amount = BigInt(E.PROVE_CHECK_AMOUNT ?? "5000000000000000000"); // 5 STRK

// Anchor a few blocks back so the proof is not built on a tip that reorgs.
const provingBlockId = (await provider.getBlockNumber()) - 10;
console.log("block   :", provingBlockId);
console.log(`\n--- proving a ${Number(amount) / 1e18} STRK deposit (not submitted) ---`);

const started = Date.now();
try {
  const { callAndProof } = await transfers
    // autoRegister bundles the one-time viewing-key registration into this
    // transaction, so a never-registered account still proves.
    .build({ autoSetup: true, autoRegister: true, provingBlockId })
    .with(STRK, (t) => t.deposit({ amount }))
    .surplusTo(account.address)
    .execute();

  console.log(`\nPROOF GENERATED in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log("  entrypoint  :", callAndProof.call.entrypoint);
  console.log("  calldata    :", callAndProof.call.calldata.length, "felts");
  console.log("  proofFacts  :", callAndProof.proof?.proofFacts?.length ?? 0);
  console.log("  proof size  :", String(callAndProof.proof?.data ?? "").length, "bytes");
  console.log("\n  NOT SUBMITTED — no account.execute() was called.");
} catch (error) {
  console.log(`\nPROVING FAILED after ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log("  name   :", error?.name);
  console.log("  message:", String(error?.message).slice(0, 400));
  if (error?.cause) console.log("  cause  :", String(error.cause?.message ?? error.cause).slice(0, 300));
  process.exit(1);
}
