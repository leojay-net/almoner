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

/**
 * Block the pool was deployed in, found by binary search on `getClassHashAt`.
 *
 * Event queries start here. Scanning from block 0 makes the node page through
 * ~9M empty blocks before reaching anything.
 */
export const POOL_DEPLOY_BLOCK = 8_978_970;

/**
 * STRK20 pool addresses per network.
 *
 * Both taken from `@avnu/avnu-sdk@4.2.0`'s exported constants and then confirmed
 * on-chain. The Sepolia pool answers `get_fee_amount` with **2 STRK**, not the 6
 * STRK mainnet charges — the fee is per-network, so never hardcode one for the
 * other. Sepolia class hash `0x56ab118a...`, matching what other teams report.
 */
export const POOLS = {
  SN_MAIN: {
    pool: "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a",
    feeFri: 6_000_000_000_000_000_000n,
    deployBlock: 8_978_970,
  },
  SN_SEPOLIA: {
    pool: "0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91",
    feeFri: 2_000_000_000_000_000_000n,
    deployBlock: 0,
  },
} as const;

/** STRK on Starknet mainnet, the pool's fee token and the usual payout token. */
export const STRK_TOKEN = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

export const VOYAGER_POOL_URL = `https://voyager.online/contract/${POOL_ADDRESS}`;

export const VOYAGER_TX_URL = (hash: string) => `https://voyager.online/tx/${hash}`;
