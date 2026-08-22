"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import {
  describeStrk20Support,
  detectStrk20Support,
  STRK20_MIN_WALLET_API,
  type Strk20Support,
} from "@almoner/strk20-capability";

import { Pill } from "@/components/ui/pill";
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
    return <p className="text-sm text-text-muted">Looking for wallets…</p>;
  }

  if (wallets.length === 0) {
    return (
      <div className="rounded-card border border-caution/35 bg-caution-wash p-4 text-sm">
        <p className="font-medium">No Starknet wallet detected.</p>
        <p className="mt-1 text-text-secondary">
          Install Ready or Braavos, switch it to Mainnet, then reload this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-text-secondary">
          {wallets.length} wallet{wallets.length === 1 ? "" : "s"} detected. STRK20 needs Wallet API{" "}
          {STRK20_MIN_WALLET_API} or later.
        </p>
        <button
          type="button"
          onClick={probeAll}
          className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-contrast transition hover:bg-accent-hover "
        >
          Check all
        </button>
      </div>

      <ul className="space-y-3">
        {wallets.map((wallet) => {
          const key = walletKey(wallet);
          const probeState = probes[key];
          return (
            <li key={key} className="rounded-card border border-line p-4 ">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  {wallet.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element -- wallet icons are data: URIs
                    <img src={wallet.icon} alt="" className="size-8 shrink-0 rounded" />
                  ) : (
                    <div className="size-8 shrink-0 rounded bg-surface-hover" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{wallet.name}</p>
                    <p className="text-xs text-text-muted">v{wallet.version}</p>
                  </div>
                </div>

                {probeState?.status === "done" && probeState.result ? (
                  <SupportBadge result={probeState.result} />
                ) : (
                  <button
                    type="button"
                    onClick={() => void probe(wallet)}
                    disabled={probeState?.status === "checking"}
                    className="shrink-0 rounded-md border border-line px-3 py-1.5 text-sm transition hover:bg-surface-hover disabled:opacity-50 "
                  >
                    {probeState?.status === "checking" ? "Checking…" : "Check"}
                  </button>
                )}
              </div>

              {probeState?.status === "done" && probeState.result ? (
                <div className="mt-3 space-y-1 border-t border-line pt-3 text-sm ">
                  <p className="text-text-secondary">{describeStrk20Support(probeState.result)}</p>
                  {probeState.result.versions.length > 0 ? (
                    <p className="font-mono text-xs text-text-muted">
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
  // Three outcomes, not two. A wallet that never answered the version query has
  // not told us it lacks STRK20 - it has told us nothing. Reporting that as
  // "No STRK20" would assert absence from missing evidence.
  if (result.supported) return <Pill tone="positive">STRK20 supported</Pill>;
  if (result.reason === "query-failed") return <Pill tone="caution">Unknown</Pill>;
  return <Pill tone="critical">No STRK20</Pill>;
}
