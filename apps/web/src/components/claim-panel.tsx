"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  buildClaimActions,
  computeCommitmentHash,
  decodeClaimLink,
  type ClaimLinkPayload,
} from "@almoner/core";
import { detectStrk20Support, describeStrk20Support } from "@almoner/strk20-capability";

import { VOYAGER_TX_URL } from "@/lib/chain";
import { getNowSeconds, getServerNowSeconds, subscribeToClock } from "@/lib/clock";
import { connectWalletAccount } from "@/lib/wallet-account";
import {
  ESCROW_ADDRESS,
  browserProvider,
  isExpired,
  readAllocation,
  type Allocation,
} from "@/lib/escrow";
import { formatExpiry, formatUnits, shortenFelt } from "@/lib/format";
import {
  getServerWalletsSnapshot,
  getWalletsSnapshot,
  subscribeNever,
  subscribeToWallets,
  walletKey,
  type DiscoveredWallet,
} from "@/lib/wallets";

type Lookup =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; allocation: Allocation }
  | { kind: "error"; message: string };

type Submission =
  | { kind: "idle" }
  | { kind: "working"; label: string }
  | { kind: "dry-run-ok" }
  | { kind: "submitted"; hash: string }
  | { kind: "error"; message: string };

export function ClaimPanel() {
  const [payload, setPayload] = useState<ClaimLinkPayload | null | undefined>(undefined);
  const [resolved, setResolved] = useState<{ hash: string; value: Lookup } | null>(null);
  const [submission, setSubmission] = useState<Submission>({ kind: "idle" });

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

  // The secret lives in the fragment, which never reaches the server.
  useEffect(() => {
    const read = () => setPayload(decodeClaimLink(window.location.hash));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const commitmentHash = payload ? computeCommitmentHash(payload.secret) : null;

  useEffect(() => {
    if (commitmentHash === null || ESCROW_ADDRESS === "") return;
    let cancelled = false;
    readAllocation(browserProvider(), ESCROW_ADDRESS, commitmentHash)
      .then((allocation) => {
        if (!cancelled) setResolved({ hash: commitmentHash, value: { kind: "loaded", allocation } });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResolved({
          hash: commitmentHash,
          value: {
            kind: "error",
            message: error instanceof Error ? error.message : String(error),
          },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [commitmentHash]);

  // Derived rather than stored, so a stale result never shows against a new link
  // and no state is set synchronously during the effect.
  const lookup: Lookup =
    commitmentHash === null || ESCROW_ADDRESS === ""
      ? { kind: "idle" }
      : resolved?.hash === commitmentHash
        ? resolved.value
        : { kind: "loading" };

  const runClaim = useCallback(
    async (wallet: DiscoveredWallet, dryRun: boolean) => {
      if (!payload) return;
      setSubmission({ kind: "working", label: dryRun ? "Proving…" : "Waiting for your wallet…" });
      try {
        const support = await detectStrk20Support(wallet);
        if (!support.supported) {
          setSubmission({ kind: "error", message: describeStrk20Support(support) });
          return;
        }

        const account = await connectWalletAccount(wallet);
        const actions = buildClaimActions([{ secret: payload.secret, token: payload.token }], {
          escrowAddress: ESCROW_ADDRESS,
          recipient: account.address,
        });

        if (dryRun) {
          // Builds and proves without submitting - the cheapest way to catch a
          // calldata-shape mistake before anyone signs anything.
          await account.strk20PrepareInvoke(actions, true);
          setSubmission({ kind: "dry-run-ok" });
          return;
        }

        const { transaction_hash } = await account.strk20InvokeTransaction(actions);
        setSubmission({ kind: "submitted", hash: transaction_hash });
      } catch (error) {
        setSubmission({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [payload],
  );

  if (!hydrated || payload === undefined) {
    return <p className="text-sm text-neutral-500">Reading your claim link…</p>;
  }

  if (payload === null) {
    return (
      <Notice tone="warn" title="No valid claim link">
        Open the link you were sent, in full. The secret travels in the part of the URL after{" "}
        <code>#</code>, so it is lost if the link is retyped or truncated.
      </Notice>
    );
  }

  return (
    <div className="space-y-6">
      <AllocationSummary payload={payload} lookup={lookup} commitmentHash={commitmentHash!} />

      {ESCROW_ADDRESS === "" ? (
        <Notice tone="warn" title="Escrow not deployed yet">
          The contract address is not configured, so this claim cannot be completed. The link
          itself parsed correctly.
        </Notice>
      ) : (
        <ClaimActions
          wallets={wallets}
          lookup={lookup}
          submission={submission}
          onClaim={runClaim}
        />
      )}
    </div>
  );
}

function AllocationSummary({
  payload,
  lookup,
  commitmentHash,
}: {
  payload: ClaimLinkPayload;
  lookup: Lookup;
  commitmentHash: string;
}) {
  const allocation = lookup.kind === "loaded" ? lookup.allocation : null;
  const amount = allocation?.amount ?? payload.amount;

  return (
    <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
      <p className="text-sm text-neutral-500">You have been sent</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">
        {amount === undefined ? "—" : formatUnits(amount)}
        <span className="ml-2 text-base font-normal text-neutral-500">
          {shortenFelt(payload.token)}
        </span>
      </p>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-neutral-500">Commitment</dt>
        <dd className="font-mono text-xs break-all">{shortenFelt(commitmentHash, 10, 8)}</dd>
        {allocation ? (
          <>
            <dt className="text-neutral-500">Status</dt>
            <dd>{allocation.status}</dd>
            <dt className="text-neutral-500">Expires</dt>
            <dd>{formatExpiry(allocation.expiry)}</dd>
          </>
        ) : null}
      </dl>

      {lookup.kind === "loading" ? (
        <p className="mt-3 text-sm text-neutral-500">Checking the escrow…</p>
      ) : null}
      {lookup.kind === "error" ? (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300">
          Could not read the escrow: {lookup.message}
        </p>
      ) : null}
    </div>
  );
}

function ClaimActions({
  wallets,
  lookup,
  submission,
  onClaim,
}: {
  wallets: readonly DiscoveredWallet[];
  lookup: Lookup;
  submission: Submission;
  onClaim: (wallet: DiscoveredWallet, dryRun: boolean) => void;
}) {
  const nowSeconds = useSyncExternalStore(
    subscribeToClock,
    getNowSeconds,
    getServerNowSeconds,
  );

  if (lookup.kind === "loaded") {
    const { allocation } = lookup;
    if (allocation.status === "None") {
      return (
        <Notice tone="warn" title="Nothing to claim">
          The escrow has no allocation for this secret. Either the link is wrong, or the batch
          funding it has not landed yet.
        </Notice>
      );
    }
    if (allocation.status !== "Funded") {
      return (
        <Notice tone="warn" title={`Already ${allocation.status.toLowerCase()}`}>
          This allocation was {allocation.status.toLowerCase()} and cannot be claimed again.
        </Notice>
      );
    }
    if (nowSeconds > 0n && isExpired(allocation, nowSeconds)) {
      return (
        <Notice tone="warn" title="Expired">
          The claim window closed on {formatExpiry(allocation.expiry)}. The funds can now be
          refunded to the sender.
        </Notice>
      );
    }
  }

  if (wallets.length === 0) {
    return (
      <Notice tone="warn" title="No Starknet wallet detected">
        Install Ready or Braavos and switch it to Mainnet. Your wallet holds the viewing key and
        generates the proof — this page never sees either.
      </Notice>
    );
  }

  const busy = submission.kind === "working";

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {wallets.map((wallet) => (
          <li
            key={walletKey(wallet)}
            className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
          >
            <span className="truncate text-sm font-medium">{wallet.name}</span>
            <span className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onClaim(wallet, true)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                Dry run
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onClaim(wallet, false)}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                Claim
              </button>
            </span>
          </li>
        ))}
      </ul>

      <SubmissionState submission={submission} />

      <p className="text-xs text-neutral-500">
        Claiming registers you with the pool if you are not registered yet, then credits a private
        note you own. A dry run proves the transaction without submitting it.
      </p>
    </div>
  );
}

function SubmissionState({ submission }: { submission: Submission }) {
  switch (submission.kind) {
    case "idle":
      return null;
    case "working":
      return <p className="text-sm text-neutral-600 dark:text-neutral-400">{submission.label}</p>;
    case "dry-run-ok":
      return (
        <Notice tone="ok" title="Dry run succeeded">
          The claim proved cleanly without being submitted, so the calldata shape is right.
        </Notice>
      );
    case "submitted":
      return (
        <Notice tone="ok" title="Claim submitted">
          <a
            href={VOYAGER_TX_URL(submission.hash)}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {shortenFelt(submission.hash, 10, 8)}
          </a>
          . Private transactions are relayed, so the sender shown on-chain is a relayer, not you.
        </Notice>
      );
    case "error":
      return (
        <Notice tone="error" title="Claim failed">
          {submission.message}
        </Notice>
      );
  }
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: "ok" | "warn" | "error";
  title: string;
  children: React.ReactNode;
}) {
  const tones = {
    ok: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40",
    warn: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
    error: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40",
  } as const;
  return (
    <div className={`rounded-lg border p-4 text-sm ${tones[tone]}`}>
      <p className="font-medium">{title}</p>
      <div className="mt-1 text-neutral-700 dark:text-neutral-300">{children}</div>
    </div>
  );
}
