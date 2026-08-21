"use client";

import { createStore, type Store } from "@starknet-io/get-starknet-discovery";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";

export type DiscoveredWallet = WalletWithStarknetFeatures;

let store: Store | null = null;

/**
 * Lazily creates the wallet-discovery store.
 *
 * Browser-only: it listens for injected-wallet announcements, so it must not be
 * constructed during server rendering.
 */
function getWalletStore(): Store {
  if (typeof window === "undefined") {
    throw new Error("wallet discovery is browser-only");
  }
  store ??= createStore();
  return store;
}

const EMPTY: readonly DiscoveredWallet[] = [];
let cached: readonly DiscoveredWallet[] = EMPTY;

/**
 * `getWallets()` allocates a fresh array per call, which would make
 * `useSyncExternalStore` re-render forever. Return the previous array unless the
 * contents actually changed.
 */
export function getWalletsSnapshot(): readonly DiscoveredWallet[] {
  const next = getWalletStore().getWallets();
  if (next.length === cached.length && next.every((wallet, i) => wallet === cached[i])) {
    return cached;
  }
  cached = next;
  return cached;
}

/** Server render has no injected wallets; a stable reference avoids a hydration loop. */
export function getServerWalletsSnapshot(): readonly DiscoveredWallet[] {
  return EMPTY;
}

export function subscribeToWallets(onStoreChange: () => void): () => void {
  return getWalletStore().subscribe(onStoreChange);
}

/** Subscribe that never fires — used to detect hydration without an effect. */
export function subscribeNever(): () => void {
  return () => {};
}

/** Stable key for a discovered wallet, for React lists. */
export function walletKey(wallet: DiscoveredWallet): string {
  return `${wallet.name}:${wallet.version}`;
}
