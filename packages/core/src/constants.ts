/**
 * Domain-separation tag for commitment hashes.
 *
 * Must stay byte-identical to `ALMONER_COMMITMENT_TAG` in
 * `contracts/src/escrow.cairo`. A cross-language parity test asserts the same
 * vector on both sides; if they drift, every issued claim link becomes
 * unredeemable.
 */
export const ALMONER_COMMITMENT_TAG = "ALMONER_COMMITMENT:V1";

/** Variant indices of the Cairo `EscrowOperation` enum, in declaration order. */
export const ESCROW_OPERATION = {
  Deposit: 0,
  Claim: 1,
} as const;

/**
 * Flat fee the pool charges per `apply_actions` call, in FRI (STRK's smallest unit).
 *
 * Charged **once per transaction**, not per payment — `collect_fee()` runs once at
 * the top of `apply_actions` — which is why batching is the whole point. Verified
 * against the deployed mainnet pool on 21 Aug 2026; published docs say 4 STRK and
 * are stale. Read `get_fee_amount` before relying on it for a real transaction.
 */
export const POOL_FEE_FRI = 6_000_000_000_000_000_000n;

/** An allocation with `expiry: 0` never expires and can never be refunded. */
export const NO_EXPIRY = 0n;
