"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import {
  describeStrk20Support,
  detectStrk20Support,
  STRK20_MIN_WALLET_API,
  type Strk20Support,
} from "@almoner/strk20-capability";

import {
  getServerWalletsSnapshot,
  getWalletsSnapshot,
  subscribeNever,
  subscribeToWallets,
  walletKey,
  type DiscoveredWallet,
} from "@/lib/wallets";

type ProbeState = Record<string, { status: "idle" | "checking" | "done"; result?: Strk20Support }>;

export function WalletCapabilityPanel() {
  // Injected wallets announce themselves asynchronously, so the list can grow a
  // beat after mount. useSyncExternalStore keeps that outside React state.
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
  const [probes, setProbes] = useState<ProbeState>({});

  const probe = useCallback(async (wallet: DiscoveredWallet) => {
    const key = walletKey(wallet);
    setProbes((prev) => ({ ...prev, [key]: { status: "checking" } }));
    const result = await detectStrk20Support(wallet);
    setProbes((prev) => ({ ...prev, [key]: { status: "done", result } }));
  }, []);

  const probeAll = useCallback(() => {
    wallets.forEach((wallet) => void probe(wallet));
  }, [wallets, probe]);

  if (!hydrated) {
    return <p className="text-sm text-neutral-500">Looking for wallets…</p>;
  }

  if (wallets.length === 0) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
        <p className="font-medium">No Starknet wallet detected.</p>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
          Install Ready or Braavos, switch it to Mainnet, then reload this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {wallets.length} wallet{wallets.length === 1 ? "" : "s"} detected. STRK20 needs Wallet
          API {STRK20_MIN_WALLET_API} or later.
        </p>
        <button
          type="button"
          onClick={probeAll}
          className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Check all
        </button>
      </div>

      <ul className="space-y-3">
        {wallets.map((wallet) => {
          const key = walletKey(wallet);
          const probeState = probes[key];
          return (
            <li
              key={key}
              className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  {wallet.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element -- wallet icons are data: URIs
                    <img src={wallet.icon} alt="" className="size-8 shrink-0 rounded" />
                  ) : (
                    <div className="size-8 shrink-0 rounded bg-neutral-200 dark:bg-neutral-700" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{wallet.name}</p>
                    <p className="text-xs text-neutral-500">v{wallet.version}</p>
                  </div>
                </div>

                {probeState?.status === "done" && probeState.result ? (
                  <SupportBadge result={probeState.result} />
                ) : (
                  <button
                    type="button"
                    onClick={() => void probe(wallet)}
                    disabled={probeState?.status === "checking"}
                    className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    {probeState?.status === "checking" ? "Checking…" : "Check"}
                  </button>
                )}
              </div>

              {probeState?.status === "done" && probeState.result ? (
                <div className="mt-3 space-y-1 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
                  <p className="text-neutral-700 dark:text-neutral-300">
                    {describeStrk20Support(probeState.result)}
                  </p>
                  {probeState.result.versions.length > 0 ? (
                    <p className="font-mono text-xs text-neutral-500">
                      reported: {probeState.result.versions.join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SupportBadge({ result }: { result: Strk20Support }) {
  const styles = result.supported
    ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
    : "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200";
  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${styles}`}>
      {result.supported ? "STRK20 supported" : "No STRK20"}
    </span>
  );
}
