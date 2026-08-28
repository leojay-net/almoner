"use client";

import { useState } from "react";

import { Wallet } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { CHAIN_ID } from "@/lib/chain";
import { shortenFelt } from "@/lib/format";
import { useWallet, walletKey, type DiscoveredWallet } from "@/lib/wallet-context";

export function ConnectButton() {
  const { connection, wallets, hydrated, connect, disconnect } = useWallet();
  const [picking, setPicking] = useState(false);

  if (!hydrated) {
    return <div className="h-9 w-32 animate-pulse rounded-xl bg-surface-hover" />;
  }

  if (connection.status === "connected") {
    const wrongNetwork = connection.chainId !== "" && connection.chainId !== CHAIN_ID;
    const usable = connection.support.supported && !wrongNetwork;
    return (
      <div className="flex items-center gap-2">
        {usable ? null : <Pill tone="caution">Cannot sign STRK20</Pill>}
        <button
          type="button"
          onClick={disconnect}
          title="Click to disconnect"
          className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-sm transition-colors hover:border-line-strong hover:bg-surface-hover"
        >
          {/* Which wallet, not just which address. Two wallets can hold the same
              account, and only some of them can execute STRK20 actions. */}
          <span
            className={`size-2 rounded-full ${usable ? "bg-positive" : "bg-caution"}`}
            aria-hidden
          />
          <span className="hidden font-medium sm:inline">{connection.wallet.name}</span>
          {connection.chainId && connection.chainId !== CHAIN_ID ? (
            <span className="text-xs font-medium text-caution">{connection.chainId}</span>
          ) : null}
          <span className="font-mono text-xs text-text-muted">
            {shortenFelt(connection.address, 6, 4)}
          </span>
        </button>
      </div>
    );
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => setPicking(true)}
        loading={connection.status === "connecting"}
      >
        <Wallet className="size-4" />
        Connect wallet
      </Button>

      <Modal
        open={picking}
        onClose={() => setPicking(false)}
        title="Connect a wallet"
        description="Your wallet holds the viewing key and generates the proof. This app never sees either."
      >
        {wallets.length === 0 ? (
          <p className="rounded-card border border-caution/35 bg-caution-wash p-4 text-sm">
            No Starknet wallet detected. Install Ready, switch it to the network this app is
            configured for, and reload.
          </p>
        ) : (
          <ul className="space-y-2">
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
      </Modal>
    </>
  );
}
