/** Public, non-secret chain configuration. Safe to ship in the browser bundle. */
export const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID ?? "SN_MAIN";

/** STRK20 privacy pool on Starknet mainnet. */
export const POOL_ADDRESS =
  process.env.NEXT_PUBLIC_POOL_ADDRESS ??
  "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";

/**
 * Flat fee the pool charges per `apply_actions` call, in FRI.
 *
 * Per transaction, not per payment: `collect_fee()` runs once per call, so a
 * batch of many transfers pays this once. Verified against the deployed mainnet
 * contract on 21 Aug 2026; the published docs say 4 STRK, which is stale.
 * Read `get_fee_amount` at runtime before relying on it for a real transaction.
 */
export const POOL_FEE_FRI = 6_000_000_000_000_000_000n;

export const VOYAGER_POOL_URL = `https://voyager.online/contract/${POOL_ADDRESS}`;

export const VOYAGER_TX_URL = (hash: string) => `https://voyager.online/tx/${hash}`;
