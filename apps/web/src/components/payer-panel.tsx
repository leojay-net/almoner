"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  POOL_FEE_FRI,
  buildFundActions,
  encodeClaimLink,
  parseRecipients,
  planBatch,
  type BatchPlan,
  type Payout,
} from "@almoner/core";
import { describeStrk20Support, detectStrk20Support } from "@almoner/strk20-capability";

import { STRK_TOKEN, VOYAGER_TX_URL } from "@/lib/chain";
import { ESCROW_ADDRESS } from "@/lib/escrow";
import { formatUnits, shortenFelt } from "@/lib/format";
import { checkRegistrations, type RegistrationStatus } from "@/lib/registration";
import { connectWalletAccount } from "@/lib/wallet-account";
import {
  getServerWalletsSnapshot,
  getWalletsSnapshot,
  subscribeNever,
  subscribeToWallets,
  walletKey,
  type DiscoveredWallet,
} from "@/lib/wallets";

const SAMPLE = `# address, amount
0x02b3f4c1a9d8e7b6a5c4d3e2f1098765432109876543210987654321098765, 12.5
0x0419a0b8c7d6e5f4039281706a5b4c3d2e1f00998877665544332211009988, 40`;

type Stage =
  | { kind: "compose" }
  | { kind: "checking" }
  | { kind: "review"; plan: BatchPlan; statuses: Map<string, RegistrationStatus> }
  | { kind: "working"; label: string }
  | { kind: "dry-run-ok" }
  | { kind: "submitted"; hash: string; plan: BatchPlan }
  | { kind: "error"; message: string };

export function PayerPanel() {
  const [text, setText] = useState(SAMPLE);
  const [refund, setRefund] = useState("");
  const [expiryDays, setExpiryDays] = useState("30");
  const [stage, setStage] = useState<Stage>({ kind: "compose" });
  const [exported, setExported] = useState(false);

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

  const parsed = useMemo(() => parseRecipients(text, { decimals: 18 }), [text]);

  const prepare = useCallback(async () => {
    setExported(false);
    if (parsed.recipients.length === 0) {
      setStage({ kind: "error", message: "Add at least one recipient." });
      return;
    }
    let refundRecipient: string;
    try {
      refundRecipient = refund.trim();
      if (BigInt(refundRecipient) === 0n) throw new Error("zero");
    } catch {
      setStage({ kind: "error", message: "Enter a valid refund address." });
      return;
    }

    setStage({ kind: "checking" });
    try {
      const statuses = await checkRegistrations(parsed.recipients.map((r) => r.address));
      const days = Number(expiryDays);
      const expiry =
        Number.isFinite(days) && days > 0
          ? BigInt(Math.floor(Date.now() / 1000) + Math.floor(days * 86_400))
          : 0n;

      const payouts: Payout[] = parsed.recipients.map((recipient) => ({
        recipient: recipient.address,
        token: STRK_TOKEN,
        amount: recipient.amount,
        // "unknown" is deliberately treated as unregistered: escrow works for
        // everyone, while a direct transfer to an unregistered recipient reverts
        // and takes the whole atomic batch with it.
        registered: statuses.get(recipient.address) === "registered",
      }));

      setStage({
        kind: "review",
        plan: planBatch(payouts, { refundRecipient, expiry }),
        statuses,
      });
    } catch (error) {
      setStage({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [parsed, refund, expiryDays]);

  const exportLinks = useCallback((plan: BatchPlan) => {
    const origin = window.location.origin;
    const rows = plan.escrowed.map((allocation) => ({
      recipient: allocation.recipient,
      amount: formatUnits(allocation.amount),
      link: encodeClaimLink(`${origin}/claim`, {
        secret: allocation.secret,
        token: allocation.token,
        amount: allocation.amount,
      }),
    }));

    const csv = [
      "recipient,amount,claim_link",
      ...rows.map((row) => `${row.recipient},${row.amount},"${row.link}"`),
    ].join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `almoner-claim-links-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExported(true);
  }, []);

  const submit = useCallback(async (wallet: DiscoveredWallet, plan: BatchPlan, dryRun: boolean) => {
    setStage({ kind: "working", label: dryRun ? "Proving…" : "Waiting for your wallet…" });
    try {
      const support = await detectStrk20Support(wallet);
      if (!support.supported) {
        setStage({ kind: "error", message: describeStrk20Support(support) });
        return;
      }
      const account = await connectWalletAccount(wallet);
      const actions = buildFundActions(plan, { escrowAddress: ESCROW_ADDRESS });

      if (dryRun) {
        await account.strk20PrepareInvoke(actions, true);
        setStage({ kind: "dry-run-ok" });
        return;
      }
      const { transaction_hash } = await account.strk20InvokeTransaction(actions);
      setStage({ kind: "submitted", hash: transaction_hash, plan });
    } catch (error) {
      setStage({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  if (!hydrated) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <label htmlFor="recipients" className="text-sm font-medium">
            Recipients
          </label>
          <p className="mt-1 text-sm text-text-muted">
            One <code>address, amount</code> per line. Paste straight from a spreadsheet.
          </p>
          <textarea
            id="recipients"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={8}
            spellCheck={false}
            className="mt-2 w-full rounded-card border border-line bg-transparent p-3 font-mono text-xs "
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="refund" className="text-sm font-medium">
              Refund address
            </label>
            <input
              id="refund"
              value={refund}
              onChange={(event) => setRefund(event.target.value)}
              placeholder="0x…"
              spellCheck={false}
              className="mt-2 w-full rounded-card border border-line bg-transparent p-2 font-mono text-xs "
            />
            <p className="mt-1 text-xs text-text-muted">
              Where unclaimed funds return. A refund is a public transfer, so use a fresh address if
              that link matters.
            </p>
          </div>
          <div>
            <label htmlFor="expiry" className="text-sm font-medium">
              Claim window (days)
            </label>
            <input
              id="expiry"
              value={expiryDays}
              onChange={(event) => setExpiryDays(event.target.value)}
              inputMode="numeric"
              className="mt-2 w-full rounded-card border border-line bg-transparent p-2 text-sm "
            />
            <p className="mt-1 text-xs text-text-muted">
              0 means never expires, and never refundable.
            </p>
          </div>
        </div>

        <ParseSummary parsed={parsed} />

        <button
          type="button"
          onClick={() => void prepare()}
          disabled={parsed.recipients.length === 0 || stage.kind === "checking"}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition hover:bg-accent-hover disabled:opacity-40 "
        >
          {stage.kind === "checking" ? "Checking the pool…" : "Review batch"}
        </button>
      </section>

      {stage.kind === "review" ? (
        <ReviewSection
          plan={stage.plan}
          statuses={stage.statuses}
          wallets={wallets}
          exported={exported}
          onExport={() => exportLinks(stage.plan)}
          onSubmit={(wallet, dryRun) => void submit(wallet, stage.plan, dryRun)}
        />
      ) : null}

      <StageMessage stage={stage} onExport={exportLinks} />
    </div>
  );
}

function ParseSummary({ parsed }: { parsed: ReturnType<typeof parseRecipients> }) {
  const total = parsed.recipients.reduce((sum, r) => sum + r.amount, 0n);
  return (
    <div className="space-y-2 text-sm">
      <p className="text-text-secondary">
        {parsed.recipients.length} recipient{parsed.recipients.length === 1 ? "" : "s"},{" "}
        {formatUnits(total)} STRK total.
      </p>
      {parsed.errors.length > 0 ? (
        <ul className="space-y-1 rounded-card border border-critical/35 bg-critical-wash p-3 text-xs">
          {parsed.errors.map((error) => (
            <li key={error.line}>
              <span className="font-medium">Line {error.line}</span>: {error.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ReviewSection({
  plan,
  statuses,
  wallets,
  exported,
  onExport,
  onSubmit,
}: {
  plan: BatchPlan;
  statuses: Map<string, RegistrationStatus>;
  wallets: readonly DiscoveredWallet[];
  exported: boolean;
  onExport: () => void;
  onSubmit: (wallet: DiscoveredWallet, dryRun: boolean) => void;
}) {
  const total = [...plan.totals.values()].reduce((sum, value) => sum + value, 0n);
  const unknown = [...statuses.values()].filter((status) => status === "unknown").length;

  return (
    <section className="space-y-4 border-t border-line pt-8 ">
      <h2 className="text-lg font-medium">Review</h2>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Total" value={`${formatUnits(total)} STRK`} />
        <Stat label="Direct notes" value={String(plan.direct.length)} />
        <Stat label="Escrowed claims" value={String(plan.escrowed.length)} />
        <Stat label="Pool fee" value={`${formatUnits(POOL_FEE_FRI)} STRK`} />
      </dl>

      <p className="text-sm text-text-secondary">
        One transaction, one fee — the same {formatUnits(POOL_FEE_FRI)} STRK whether this pays one
        person or five hundred.
      </p>

      {unknown > 0 ? (
        <p className="rounded-card border border-caution/35 bg-caution-wash p-3 text-sm">
          Registration could not be confirmed for {unknown} address
          {unknown === 1 ? "" : "es"}, so {unknown === 1 ? "it is" : "they are"} routed through
          escrow. That always works — the recipient just claims with a link instead of receiving a
          note directly.
        </p>
      ) : null}

      {plan.escrowed.length > 0 ? (
        <div className="rounded-card border border-caution/35 bg-caution-wash p-4 text-sm">
          <p className="font-medium">Save the claim links before you fund</p>
          <p className="mt-1 text-text-secondary">
            The claim secrets exist only in this browser tab and are never sent anywhere. If you
            fund the batch and lose them, the {plan.escrowed.length} escrowed payment
            {plan.escrowed.length === 1 ? "" : "s"} cannot be claimed by anyone and will sit until
            the refund window opens.
          </p>
          <button
            type="button"
            onClick={onExport}
            className="mt-3 rounded-md border border-line-strong bg-white px-3 py-1.5 text-sm font-medium transition hover:bg-surface-hover dark:bg-accent "
          >
            {exported ? "Download again" : "Download claim links (CSV)"}
          </button>
        </div>
      ) : null}

      {wallets.length === 0 ? (
        <p className="text-sm text-text-muted">
          No Starknet wallet detected. Install Ready or Braavos and switch to Mainnet.
        </p>
      ) : (
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
                  onClick={() => onSubmit(wallet, true)}
                  className="rounded-md border border-line px-3 py-1.5 text-sm transition hover:bg-surface-hover "
                >
                  Dry run
                </button>
                <button
                  type="button"
                  onClick={() => onSubmit(wallet, false)}
                  disabled={plan.escrowed.length > 0 && !exported}
                  title={
                    plan.escrowed.length > 0 && !exported
                      ? "Download the claim links first"
                      : undefined
                  }
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-contrast transition hover:bg-accent-hover disabled:opacity-40"
                >
                  Fund batch
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line p-3 ">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-1 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function StageMessage({ stage, onExport }: { stage: Stage; onExport: (plan: BatchPlan) => void }) {
  if (stage.kind === "working") {
    return <p className="text-sm text-text-secondary">{stage.label}</p>;
  }
  if (stage.kind === "dry-run-ok") {
    return (
      <p className="rounded-card border border-positive/35 bg-positive-wash p-4 text-sm">
        <span className="font-medium">Dry run succeeded.</span> The batch proved cleanly without
        being submitted, so the calldata shape is right.
      </p>
    );
  }
  if (stage.kind === "submitted") {
    return (
      <div className="rounded-card border border-positive/35 bg-positive-wash p-4 text-sm">
        <p className="font-medium">Batch funded</p>
        <p className="mt-1">
          <a
            href={VOYAGER_TX_URL(stage.hash)}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {shortenFelt(stage.hash, 10, 8)}
          </a>
        </p>
        {stage.plan.escrowed.length > 0 ? (
          <button
            type="button"
            onClick={() => onExport(stage.plan)}
            className="mt-3 rounded-md border border-line-strong bg-white px-3 py-1.5 text-sm font-medium dark:bg-accent"
          >
            Download claim links again
          </button>
        ) : null}
      </div>
    );
  }
  if (stage.kind === "error") {
    return (
      <p className="rounded-card border border-critical/35 bg-critical-wash p-4 text-sm">
        {stage.message}
      </p>
    );
  }
  return null;
}
