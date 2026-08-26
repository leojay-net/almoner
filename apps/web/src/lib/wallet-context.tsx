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
import { walletV6 } from "starknet";

import { connectWalletAccount } from "./wallet-account";
import { explainWalletError, withWalletTimeout } from "./wallet-error";
import {
  getServerWalletsSnapshot,
  getWalletsSnapshot,
  subscribeNever,
  subscribeToWallets,
  walletKey,
  type DiscoveredWallet,
} from "./wallets";

const REMEMBERED = "almoner.wallet";

/** Chain ids arrive as a felt-encoded short string such as 0x534e5f5345504f4c4941. */
function decodeChainId(value: string): string {
  if (!value.startsWith("0x")) return value;
  try {
    const bytes = value.slice(2).match(/.{2}/g) ?? [];
    return bytes.map((b) => String.fromCharCode(parseInt(b, 16))).join("");
  } catch {
    return value;
  }
}

export type Connection =
  | { status: "disconnected" }
  | { status: "connecting"; walletName: string }
  | {
      status: "connected";
      wallet: DiscoveredWallet;
      account: WalletAccountV6;
      address: string;
      support: Strk20Support;
      /** The chain the wallet is actually on, e.g. "SN_SEPOLIA". */
      chainId: string;
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
      const account = await withWalletTimeout(connectWalletAccount(wallet), {
        seconds: 30,
        action: `connect to ${wallet.name}`,
      });
      // A wallet pointed at a different network than the app fails every action
      // with an opaque error, because the pool address does not exist there.
      let chainId = "";
      try {
        const raw = await walletV6.requestChainId(
          wallet as unknown as Parameters<typeof walletV6.requestChainId>[0],
        );
        chainId = decodeChainId(String(raw));
      } catch {
        chainId = "";
      }
      setConnection({
        status: "connected",
        wallet,
        account,
        address: account.address,
        support,
        chainId,
      });
      window.localStorage.setItem(REMEMBERED, wallet.name);
    } catch (error) {
      // Forget it: otherwise a broken extension is retried on every page load.
      window.localStorage.removeItem(REMEMBERED);
      setConnection({
        status: "error",
        message: explainWalletError(error, { feeLabel: "pool" }),
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
