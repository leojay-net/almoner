/**
 * Public, non-secret chain configuration. Safe to ship in the browser bundle.
 *
 * Everything network-dependent is derived from one place, because the two
 * networks genuinely differ: the Sepolia pool charges 2 STRK per transaction and
 * mainnet charges 6. Hardcoding either would make every estimate wrong by 3x on
 * the other.
 */

export const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID ?? "SN_MAIN";

/**
 * STRK20 pool per network.
 *
 * Both addresses come from `@avnu/avnu-sdk@4.2.0`'s exported constants and were
 * then confirmed on-chain by calling `get_fee_amount`. Sepolia's pool class hash
 * is `0x56ab118a...`, matching what other sprint teams report.
 */
export const POOLS = {
  SN_MAIN: {
    pool: "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a",
    /** Per `apply_actions` call, not per payment — batching amortizes it. */
    feeFri: 6_000_000_000_000_000_000n,
    /** Found by binary search on `getClassHashAt`; event scans start here. */
    deployBlock: 8_978_970,
    explorer: "https://voyager.online",
  },
  SN_SEPOLIA: {
    pool: "0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91",
    feeFri: 2_000_000_000_000_000_000n,
    deployBlock: 0,
    explorer: "https://sepolia.voyager.online",
  },
} as const;

const ACTIVE = CHAIN_ID === "SN_SEPOLIA" ? POOLS.SN_SEPOLIA : POOLS.SN_MAIN;

export const POOL_ADDRESS = process.env.NEXT_PUBLIC_POOL_ADDRESS ?? ACTIVE.pool;
export const POOL_FEE_FRI = ACTIVE.feeFri;
export const POOL_DEPLOY_BLOCK = ACTIVE.deployBlock;

/** STRK — the pool's fee token and the usual payout token. Same address on both. */
export const STRK_TOKEN = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

/** Known tokens, so the UI shows "STRK" rather than a 64-character address. */
const TOKEN_SYMBOLS: Record<string, string> = {
  [BigInt(STRK_TOKEN).toString()]: "STRK",
  [BigInt("0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7").toString()]: "ETH",
};

/** Symbol for a token address, or a shortened address when it is unknown. */
export function tokenSymbol(address: string): string {
  try {
    return TOKEN_SYMBOLS[BigInt(address).toString()] ?? `${address.slice(0, 6)}…${address.slice(-4)}`;
  } catch {
    return address;
  }
}

export const VOYAGER_POOL_URL = `${ACTIVE.explorer}/contract/${POOL_ADDRESS}`;
export const VOYAGER_TX_URL = (hash: string) => `${ACTIVE.explorer}/tx/${hash}`;
