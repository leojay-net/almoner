"use client";

import type { WalletAccountV6 } from "starknet";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { detectStrk20Support, type Strk20Support } from "@almoner/strk20-capability";

import { connectWalletAccount } from "./wallet-account";
import {
  getServerWalletsSnapshot,
  getWalletsSnapshot,
  subscribeNever,
  subscribeToWallets,
  walletKey,
  type DiscoveredWallet,
} from "./wallets";

const REMEMBERED = "almoner.wallet";

export type Connection =
  | { status: "disconnected" }
  | { status: "connecting"; walletName: string }
  | {
      status: "connected";
      wallet: DiscoveredWallet;
      account: WalletAccountV6;
      address: string;
      support: Strk20Support;
    }
  | { status: "error"; message: string };

interface WalletContextValue {
  connection: Connection;
  wallets: readonly DiscoveredWallet[];
  hydrated: boolean;
  connect: (wallet: DiscoveredWallet) => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

/**
 * One connection for the whole app.
 *
 * Previously each panel discovered wallets and connected on demand, which meant
 * there was no way to see whether you were connected, or as whom, before
 * committing to an action. Money movement should never be the thing that reveals
 * which account you are about to spend from.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<Connection>({ status: "disconnected" });

  const wallets = useSyncExternalStore(
    subscribeToWallets,
    getWalletsSnapshot,
    getServerWalletsSnapshot,
  );
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  const connect = useCallback(async (wallet: DiscoveredWallet) => {
    setConnection({ status: "connecting", walletName: wallet.name });
    try {
      // Capability first: connecting to a wallet that cannot execute STRK20
      // actions only defers the failure to the first thing you try to do.
      const support = await detectStrk20Support(wallet);
      const account = await connectWalletAccount(wallet);
      setConnection({
        status: "connected",
        wallet,
        account,
        address: account.address,
        support,
      });
      window.localStorage.setItem(REMEMBERED, wallet.name);
    } catch (error) {
      setConnection({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  const disconnect = useCallback(() => {
    window.localStorage.removeItem(REMEMBERED);
    setConnection({ status: "disconnected" });
  }, []);

  // Reconnect the wallet used last time, once it announces itself. Silent: a
  // reconnect that pops a prompt on every page load trains people to click
  // through prompts, which is the opposite of what a payments tool wants.
  const reconnectAttempted = useRef(false);
  useEffect(() => {
    if (reconnectAttempted.current || wallets.length === 0) return;
    const remembered = window.localStorage.getItem(REMEMBERED);
    if (!remembered) return;
    const match = wallets.find((w) => w.name === remembered);
    if (!match) return;

    reconnectAttempted.current = true;
    // Deferred out of the effect body: connect() sets state synchronously, and
    // doing that during an effect cascades renders.
    const timer = setTimeout(() => void connect(match), 0);
    return () => clearTimeout(timer);
  }, [wallets, connect]);

  const value = useMemo(
    () => ({ connection, wallets, hydrated, connect, disconnect }),
    [connection, wallets, hydrated, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (context === null) throw new Error("useWallet must be used inside WalletProvider");
  return context;
}

export { walletKey };
export type { DiscoveredWallet };
