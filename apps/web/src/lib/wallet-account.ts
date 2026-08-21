"use client";

import { WalletAccountV6 } from "starknet";

import { browserProvider } from "./escrow";
import type { DiscoveredWallet } from "./wallets";

/** The wallet type `WalletAccountV6.connect` expects, derived from its signature. */
type ConnectableWallet = Parameters<typeof WalletAccountV6.connect>[1];

/**
 * Connects a discovered wallet as a STRK20-capable account.
 *
 * starknet bundles its own copy of the wallet-standard types, so the wallet
 * object from `@starknet-io/get-starknet-discovery` is structurally identical but
 * nominally a different type. The cast is contained here rather than repeated at
 * every call site — and it is a cast, not a conversion: the same object satisfies
 * both declarations.
 */
export function connectWalletAccount(wallet: DiscoveredWallet): Promise<WalletAccountV6> {
  return WalletAccountV6.connect(browserProvider(), wallet as unknown as ConnectableWallet);
}
