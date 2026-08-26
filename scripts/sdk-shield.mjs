#!/usr/bin/env node
/**
 * Shields STRK through the SDK route, for real.
 *
 * Two transactions, in this order and for a reason: the pool pulls tokens with
 * `transfer_from` while the proof executes, so the ERC-20 approval has to be
 * visible on-chain before the proof is even built. The proving block id is
 * re-fetched after the approval lands, so the proof is not anchored to a base
 * older than the approval it depends on.
 *
 *   set -a; . apps/web/.env.local; set +a
 *   node scripts/sdk-shield.mjs [amountSTRK]
 *
 * This spends money. Run scripts/prove-check.mjs first.
 */

import { Account, Contract, RpcProvider, constants, getTipStatsFromBlocks } from "starknet";
import { ContractDiscoveryProvider } from "@starkware-libs/starknet-privacy-sdk/testing";
import { PrivacyPoolABI } from "@starkware-libs/starknet-privacy-sdk/abi";
import { ProvingServiceProofProvider, createPrivateTransfers } from "@starkware-libs/starknet-privacy-sdk";

const E = process.env;
const need = (n) => {
  const v = E[n];
  if (!v) { console.error(`missing ${n}`); process.exit(2); }
  return v;
};

const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const chain = E.NEXT_PUBLIC_CHAIN_ID ?? "SN_SEPOLIA";
const poolAddress = need("NEXT_PUBLIC_POOL_ADDRESS");
const whole = process.argv[2] ?? "5";
const amount = BigInt(Math.round(Number(whole) * 1e18));

const provider = new RpcProvider({ nodeUrl: need("STARKNET_RPC_URL") });
const account = new Account({
  provider,
  address: need("STRK20_SDK_ACCOUNT_ADDRESS"),
  signer: need("STRK20_SDK_PRIVATE_KEY"),
  cairoVersion: "1",
});
const explorer = chain === "SN_MAIN" ? "https://voyager.online" : "https://sepolia.voyager.online";

console.log(`shielding ${whole} STRK on ${chain}`);
console.log("account :", account.address);

function brief(error) {
  // Errors from this path carry the entire signed transaction, proof included.
  // Printing them raw buries the one line that matters in 300KB of base64.
  const parts = [];
  if (error?.name) parts.push(error.name);
  if (error?.message) {
    // RPC errors embed the whole request and put the reason at the very end,
    // so head-truncating hides the only useful part.
    const m = String(error.message);
    parts.push(m.length > 900 ? `${m.slice(0, 300)}\n  …\n  ${m.slice(-600)}` : m);
  }
  let cause = error?.cause;
  let depth = 0;
  while (cause && depth++ < 3) {
    parts.push("caused by: " + String(cause.message ?? cause).slice(0, 400));
    cause = cause.cause;
  }
  return parts.join("\n  ");
}

try {
// ── 1. approve ───────────────────────────────────────────────────────────────
console.log("\n[1/2] approving the pool to pull tokens");
const approve = await account.execute(
  {
    contractAddress: STRK,
    entrypoint: "approve",
    calldata: [poolAddress, amount.toString(), "0"],
  },
  { tip: 0n },
);
console.log("      tx:", approve.transaction_hash);
await provider.waitForTransaction(approve.transaction_hash);
console.log("      accepted");

// ── 2. prove and submit ──────────────────────────────────────────────────────
const transfers = createPrivateTransfers({
  account,
  viewingKeyProvider: { getViewingKey: async () => BigInt(need("STRK20_SDK_VIEWING_KEY")) },
  provingProvider: new ProvingServiceProofProvider(
    need("STRK20_PROVING_URL"),
    chain === "SN_MAIN" ? constants.StarknetChainId.SN_MAIN : constants.StarknetChainId.SN_SEPOLIA,
  ),
  discoveryProvider: new ContractDiscoveryProvider(
    new Contract({ abi: PrivacyPoolABI, address: poolAddress, providerOrAccount: provider }),
  ),
  poolContractAddress: poolAddress,
});

// Re-fetch AFTER the approval landed, so the proof base is not older than it.
const provingBlockId = (await provider.getBlockNumber()) - 10;
console.log(`\n[2/2] proving (block ${provingBlockId}) then submitting`);

const started = Date.now();
const { callAndProof } = await transfers
  .build({ autoSetup: true, autoRegister: true, provingBlockId })
  .with(STRK, (t) => t.deposit({ amount }))
  .surplusTo(account.address)
  .execute();
console.log(`      proved in ${((Date.now() - started) / 1000).toFixed(1)}s`);

const proofDetails = callAndProof.proof?.proofFacts?.length
  ? { proofFacts: callAndProof.proof.proofFacts, proof: callAndProof.proof.data }
  : {};
// Skip fee estimation entirely.
//
// Neither account.execute()'s internal estimate nor estimateInvokeFee() forwards
// proofFacts, so the pool sees a call carrying none and reverts on
// `assert(!proof_facts_span.is_empty(), EMPTY_PROOF_FACTS)` before the real
// submission is attempted. Supplying resourceBounds suppresses the estimate.
//
// These are caps, not charges: the account pays actual usage. They are set well
// above a ~300KB proof's needs so a busy block cannot push the transaction over.
// Derived from the current block, not guessed.
//
// The sequencer rejects bounds whose worst case exceeds the account balance —
// "Resources bounds ... exceed balance" — so arbitrarily generous caps fail
// validation before the transaction is ever run. Prices are taken live and given
// a 3x headroom; amounts are sized for a ~300KB proof.
//
// BigInt throughout: starknet.js does arithmetic on these, and mixing in strings
// throws "Cannot mix BigInt and other types".
const block = await provider.getBlock("latest");
// FEE_UNIT: "fri" pays in STRK, "wei" pays in ETH. Which one the account uses is
// not something the error tells you — "exceed balance" comes back identically
// either way, even for caps far below the reported balance, because the balance
// it reports is the STRK one while the comparison may be against ETH.
const FEE_UNIT = process.env.FEE_UNIT === "wei" ? "price_in_wei" : "price_in_fri";
const priceOf = (k) => BigInt(block?.[k]?.[FEE_UNIT] ?? 0) || 1n;

// Modest, realistic caps rather than headroom.
//
// Validation rejects bounds whose worst case it deems beyond the balance, and it
// is stricter than a plain sum — 17 STRK of caps against a 136 STRK balance was
// still refused. These are sized for what an apply_actions with a ~300KB proof
// actually consumes; if that is short the failure is an explicit out-of-gas,
// which is a far better error to get than a validation refusal.
//
// BigInt throughout: starknet.js does arithmetic here and mixing in strings
// throws "Cannot mix BigInt and other types".
const resourceBounds = {
  l1_gas: { max_amount: BigInt(process.env.L1_GAS ?? "100"), max_price_per_unit: priceOf("l1_gas_price") * 2n },
  l2_gas: { max_amount: BigInt(process.env.L2_GAS ?? "60000000"), max_price_per_unit: priceOf("l2_gas_price") * 2n },
  l1_data_gas: { max_amount: BigInt(process.env.L1_DATA_GAS ?? "6000"), max_price_per_unit: priceOf("l1_data_gas_price") * 2n },
};
const worstCase =
  resourceBounds.l1_gas.max_amount * resourceBounds.l1_gas.max_price_per_unit +
  resourceBounds.l2_gas.max_amount * resourceBounds.l2_gas.max_price_per_unit +
  resourceBounds.l1_data_gas.max_amount * resourceBounds.l1_data_gas.max_price_per_unit;
console.log("      fee cap :", (Number(worstCase) / 1e18).toFixed(4), "STRK");

// The zero-tip rule belongs to the pool's __validate__, which runs during the
// *virtual* execution while proving. This is our own account's real submission,
// and the sequencer orders by tip — at zero it sat in the mempool until its TTL
// expired and was evicted.
let tip = 0n;
try {
  const stats = await getTipStatsFromBlocks(provider, { blockCount: 10 });
  // Pay above the median so a busy block does not strand a proof that took
  // seconds to produce and cannot be reused once its anchor block ages out.
  const median = stats?.median ?? stats?.medianTip ?? 0;
  tip = BigInt(median) * 2n;
} catch {
  /* fall through to the floor below */
}
if (process.env.TIP !== undefined) tip = BigInt(process.env.TIP);
else if (tip < 1_000_000_000n) tip = 1_000_000_000n;
console.log("      tip:", tip.toString());

const tx = await account.execute(callAndProof.call, {
  tip,
  resourceBounds,
  ...proofDetails,
});
console.log("      tx:", tx.transaction_hash);

const receipt = await provider.waitForTransaction(tx.transaction_hash);
console.log("\nSUBMITTED");
console.log("  approve :", `${explorer}/tx/${approve.transaction_hash}`);
console.log("  shield  :", `${explorer}/tx/${tx.transaction_hash}`);
console.log("  status  :", receipt?.execution_status ?? receipt?.status ?? "(see explorer)");
} catch (error) {
  console.log("\nFAILED");
  console.log("  " + brief(error));
  process.exit(1);
}
