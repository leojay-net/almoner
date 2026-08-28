"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  buildClaimActions,
  computeCommitmentHash,
  decodeClaimLink,
  type ClaimLinkPayload,
} from "@almoner/core";
import { Button } from "@/components/ui/button";
import { detectStrk20Support, describeStrk20Support } from "@almoner/strk20-capability";

import { POOL_FEE_FRI, STRK_TOKEN, VOYAGER_TX_URL, tokenSymbol } from "@/lib/chain";
import { checkRegistration } from "@/lib/registration";
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
import { Spinner, Working } from "@/components/ui/spinner";
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
        if (!cancelled)
          setResolved({ hash: commitmentHash, value: { kind: "loaded", allocation } });
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

        // A first-time claimer fails twice over without this: the pool rejects
        // the transfer with NOT_REGISTERED because they have no viewing key,
        // and even registered they would have nothing inside the pool to pay
        // the flat fee from. One deposit in the same transaction fixes both,
        // and keeps it to a single fee rather than two.
        setSubmission({ kind: "working", label: "Checking your pool account…" });
        const registration = await checkRegistration(account.address);
        const needsSetup = registration !== "registered";
        setSubmission({
          kind: "working",
          label: dryRun
            ? "Proving…"
            : needsSetup
              ? "Waiting for your wallet — this also sets up your pool account"
              : "Waiting for your wallet…",
        });

        const actions = buildClaimActions([{ secret: payload.secret, token: payload.token }], {
          escrowAddress: ESCROW_ADDRESS,
          recipient: account.address,
          ...(needsSetup
            ? { setupDeposit: { token: STRK_TOKEN, amount: POOL_FEE_FRI.toString() } }
            : {}),
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
    return <p className="text-sm text-text-muted">Reading your claim link…</p>;
  }

  if (payload === null) {
    return <ClaimLinkEntry onAccept={setPayload} />;
  }

  return (
    <div className="space-y-6">
      <AllocationSummary payload={payload} lookup={lookup} commitmentHash={commitmentHash!} />

      {ESCROW_ADDRESS === "" ? (
        <Notice tone="warn" title="Escrow not deployed yet">
          The contract address is not configured, so this claim cannot be completed. The link itself
          parsed correctly.
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

/**
 * Entry point for someone who arrived without a working link.
 *
 * A link can lose its fragment in a dozen ordinary ways - pasted into a chat that
 * strips it, retyped, forwarded as plain text. Refusing to proceed and telling
 * the reader to go find a better link is a dead end, so accept the thing they
 * actually have: the whole URL, or just the code from the end of it.
 */
function ClaimLinkEntry({ onAccept }: { onAccept: (payload: ClaimLinkPayload) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = decodeClaimLink(value.trim());
    if (parsed === null) {
      setError(
        "That does not look like a claim link. Paste the whole link, or just the code after the #.",
      );
      return;
    }
    setError(null);
    // Put it back in the address bar so a reload keeps working and the page can
    // be re-shared - without ever sending the secret to a server.
    window.location.hash = window.location.hash || "";
    history.replaceState(null, "", `#s=${parsed.secret}&t=${parsed.token}`);
    onAccept(parsed);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-card border border-line bg-surface p-6">
        <label htmlFor="claim-link" className="block text-sm font-medium">
          Paste your claim link or code
        </label>
        <p className="mt-1 text-sm text-text-secondary">
          Either the whole link you were sent, or just the code from the end of it.
        </p>
        <input
          id="claim-link"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          autoFocus
          spellCheck={false}
          placeholder="https://…/claim#s=0x…&t=0x…"
          className="mt-4 w-full rounded-xl border border-line bg-surface-raised px-3.5 py-2.5 font-mono text-xs transition-colors hover:border-line-strong focus:border-accent focus:ring-4 focus:ring-accent-wash focus:outline-none"
        />
        {error ? <p className="mt-3 text-sm text-critical">{error}</p> : null}
        <div className="mt-5">
          <Button type="submit" disabled={value.trim() === ""}>
            Continue
          </Button>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-text-muted">
        Pasting it here keeps the secret in your browser. It is never sent to a server — the app
        only ever asks the network about the commitment hash derived from it, which is public
        on-chain anyway.
      </p>
    </form>
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
  // A "None" allocation has zeroed fields because it does not exist on-chain yet.
  // Showing its 0 as the amount tells the recipient they were sent nothing, when
  // the truth is the batch has not been funded. Fall back to the link's figure.
  const onChainAmount = allocation !== null && allocation.status !== "None" ? allocation.amount : undefined;
  const amount = onChainAmount ?? payload.amount;

  return (
    <div className="rounded-card border border-line p-5 ">
      <p className="text-sm text-text-muted">You have been sent</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">
        {amount === undefined ? "—" : formatUnits(amount)}
        <span className="ml-2 text-base font-normal text-text-muted">
          {tokenSymbol(payload.token)}
        </span>
      </p>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-text-muted">Commitment</dt>
        <dd className="font-mono text-xs break-all">{shortenFelt(commitmentHash, 10, 8)}</dd>
        {allocation ? (
          <>
            <dt className="text-text-muted">Status</dt>
            <dd>{allocation.status}</dd>
            <dt className="text-text-muted">Expires</dt>
            <dd>{formatExpiry(allocation.expiry)}</dd>
          </>
        ) : null}
      </dl>

      {lookup.kind === "loading" ? <Working className="mt-3">Checking the escrow…</Working> : null}
      {lookup.kind === "error" ? (
        <p className="mt-3 text-sm text-critical">Could not read the escrow: {lookup.message}</p>
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
  const nowSeconds = useSyncExternalStore(subscribeToClock, getNowSeconds, getServerNowSeconds);

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
            className="flex items-center justify-between gap-3 rounded-card border border-line p-3 "
          >
            <span className="truncate text-sm font-medium">{wallet.name}</span>
            <span className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onClaim(wallet, true)}
                className="rounded-md border border-line px-3 py-1.5 text-sm transition hover:bg-surface-hover disabled:opacity-50 "
              >
                Dry run
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onClaim(wallet, false)}
                aria-busy={busy || undefined}
                className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-contrast transition hover:bg-accent-hover disabled:opacity-40 aria-[busy=true]:opacity-100"
              >
                {busy ? <Spinner className="size-3.5" /> : null}
                Claim
              </button>
            </span>
          </li>
        ))}
      </ul>

      <SubmissionState submission={submission} />

      <p className="text-xs leading-relaxed text-text-muted">
        Claiming credits a private note only you can spend. If you have never used the pool,
        the same transaction also shields {formatUnits(POOL_FEE_FRI)} STRK from your wallet — that
        registers you and covers the pool&rsquo;s flat fee, which is charged against funds inside
        the pool and cannot be paid from a public balance. You need that much STRK in your wallet.
        A dry run proves the transaction without submitting it.
      </p>
    </div>
  );
}

function SubmissionState({ submission }: { submission: Submission }) {
  switch (submission.kind) {
    case "idle":
      return null;
    case "working":
      return <Working>{submission.label}</Working>;
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
    ok: "border-positive/35 bg-positive-wash",
    warn: "border-caution/35 bg-caution-wash",
    error: "border-critical/35 bg-critical-wash",
  } as const;
  return (
    <div className={`rounded-card border p-4 text-sm ${tones[tone]}`}>
      <p className="font-medium">{title}</p>
      <div className="mt-1 text-text-secondary">{children}</div>
    </div>
  );
}
