"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { Close, Wallet } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { shortenFelt } from "@/lib/format";
import { useWallet, walletKey, type DiscoveredWallet } from "@/lib/wallet-context";

export function ConnectButton() {
  const { connection, wallets, hydrated, connect, disconnect } = useWallet();
  const [picking, setPicking] = useState(false);

  if (!hydrated) {
    return <div className="h-9 w-32 animate-pulse rounded-xl bg-surface-hover" />;
  }

  if (connection.status === "connected") {
    return (
      <div className="flex items-center gap-2">
        {connection.support.supported ? null : (
          <Pill tone="caution">No STRK20</Pill>
        )}
        <button
          type="button"
          onClick={disconnect}
          title={`${connection.wallet.name} — click to disconnect`}
          className="group flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm transition-colors hover:border-line-strong hover:bg-surface-hover"
        >
          <span className="size-2 rounded-full bg-positive" />
          <span className="font-mono text-xs">{shortenFelt(connection.address, 6, 4)}</span>
        </button>
      </div>
    );
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => setPicking(true)}
        disabled={connection.status === "connecting"}
      >
        <Wallet className="size-4" />
        {connection.status === "connecting" ? "Connecting…" : "Connect wallet"}
      </Button>

      <AnimatePresence>
        {picking ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setPicking(false)}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Choose a wallet"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="fixed top-1/2 left-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-panel border border-line bg-surface p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Connect a wallet</h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Your wallet holds the viewing key and generates the proof. This app never
                    sees either.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPicking(false)}
                  aria-label="Close"
                  className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-hover"
                >
                  <Close className="size-5" />
                </button>
              </div>

              {wallets.length === 0 ? (
                <p className="mt-6 rounded-card border border-caution/35 bg-caution-wash p-4 text-sm">
                  No Starknet wallet detected. Install Ready, switch it to the network this app
                  is configured for, and reload.
                </p>
              ) : (
                <ul className="mt-6 space-y-2">
                  {wallets.map((wallet: DiscoveredWallet) => (
                    <li key={walletKey(wallet)}>
                      <button
                        type="button"
                        onClick={() => {
                          setPicking(false);
                          void connect(wallet);
                        }}
                        className="flex w-full items-center gap-3 rounded-card border border-line p-3 text-left transition-colors hover:border-line-strong hover:bg-surface-hover"
                      >
                        {wallet.icon ? (
                          // eslint-disable-next-line @next/next/no-img-element -- data: URI
                          <img src={wallet.icon} alt="" className="size-8 rounded" />
                        ) : (
                          <div className="size-8 rounded bg-surface-hover" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{wallet.name}</span>
                          <span className="block text-xs text-text-muted">v{wallet.version}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {connection.status === "error" ? (
                <p className="mt-4 rounded-card border border-critical/35 bg-critical-wash p-3 text-sm">
                  {connection.message}
                </p>
              ) : null}
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
