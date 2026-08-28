"use client";

import { useCallback, useMemo, useState } from "react";
import {
  buildFundActions,
  encodeClaimLink,
  parseRecipients,
  planBatch,
  type BatchPlan,
  type Payout,
} from "@almoner/core";
import { describeStrk20Support } from "@almoner/strk20-capability";

import { ArrowRight, Check, Download, External } from "@/components/icons";
import { BalanceCard } from "@/components/send/balance-card";
import { ConnectButton } from "@/components/shell/connect-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextAreaField, TextField } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { CHAIN_ID, POOL_ADDRESS, POOL_FEE_FRI, STRK_TOKEN, VOYAGER_TX_URL } from "@/lib/chain";
import { ESCROW_ADDRESS } from "@/lib/escrow";
import { formatUnits, shortenFelt } from "@/lib/format";
import { recordReceipt } from "@/lib/receipts";
import { checkRegistrations, type RegistrationStatus } from "@/lib/registration";
import { useAccountStatus } from "@/lib/account-status";
import { useWallet } from "@/lib/wallet-context";
import { walletExecutor } from "@/lib/executor-wallet";
import { explainWalletError } from "@/lib/wallet-error";
import { trace } from "@/lib/trace";

/**
 * The send screen.
 *
 * One page: your position, the payment, and a confirmation. It was a five-step
 * wizard before, which is how you build a demo rather than a tool — a numbered
 * march is fine the first time and insufferable the tenth, and it hid the form
 * from anyone who just wanted to pay someone. Prerequisites now appear as
 * banners above the form instead of gates in front of it, so the thing you came
 * to do is always on screen.
 */
export function SendScreen() {
  const { connection } = useWallet();
  const status = useAccountStatus();

  const [text, setText] = useState("");
  const [refund, setRefund] = useState("");
  const [expiryDays, setExpiryDays] = useState("30");

  const [plan, setPlan] = useState<BatchPlan | null>(null);
  const [statuses, setStatuses] = useState<Map<string, RegistrationStatus>>(new Map());
  const [confirming, setConfirming] = useState(false);
  const [exported, setExported] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const executor = useMemo(
    () =>
      connection.status === "connected"
        ? walletExecutor(connection.account, connection.wallet.name)
        : null,
    [connection],
  );

  const parsed = useMemo(() => parseRecipients(text, { decimals: 18 }), [text]);
  const connectedAddress = connection.status === "connected" ? connection.address : "";
  const refundAddress = refund.trim() === "" ? connectedAddress : refund.trim();
  const total = parsed.recipients.reduce((sum, r) => sum + r.amount, 0n);
  const feeLabel = `${formatUnits(POOL_FEE_FRI)} STRK`;

  const fail = useCallback(
    (e: unknown) => setError(explainWalletError(e, { feeLabel })),
    [feeLabel],
  );

  const review = useCallback(async () => {
    setError(null);
    if (parsed.recipients.length === 0) return;
    try {
      if (BigInt(refundAddress) === 0n) throw new Error("Add a refund address.");
    } catch {
      setError("That refund address is not valid.");
      return;
    }
    setBusy("Checking which recipients already use the pool…");
    try {
      const found = await checkRegistrations(parsed.recipients.map((r) => r.address));
      const days = Number(expiryDays);
      const expiry =
        Number.isFinite(days) && days > 0
          ? BigInt(Math.floor(Date.now() / 1000) + Math.floor(days * 86_400))
          : 0n;
      const payouts: Payout[] = parsed.recipients.map((r) => ({
        recipient: r.address,
        token: STRK_TOKEN,
        amount: r.amount,
        registered: found.get(r.address) === "registered",
      }));
      setStatuses(found);
      setPlan(planBatch(payouts, { refundRecipient: refundAddress, expiry }));
      setExported(false);
      setSent(null);
      setConfirming(true);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }, [parsed, refundAddress, expiryDays, fail]);

  const exportLinks = useCallback(() => {
    if (plan === null) return;
    const origin = window.location.origin;
    const csv = [
      "recipient,amount,claim_link",
      ...plan.escrowed.map((a) =>
        [
          a.recipient,
          formatUnits(a.amount),
          `"${encodeClaimLink(`${origin}/claim`, { secret: a.secret, token: a.token, amount: a.amount })}"`,
        ].join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `almoner-claim-links-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExported(true);
  }, [plan]);

  const send = useCallback(
    async (dryRun: boolean) => {
      if (plan === null || executor === null) return;
      setError(null);
      setBusy(dryRun ? "Proving — nothing is submitted" : "Confirm in your wallet");
      const t = trace(dryRun ? "send · dry run" : "send · submit", {
        chain: CHAIN_ID,
        pool: POOL_ADDRESS,
        escrow: ESCROW_ADDRESS || "(not deployed)",
        direct: plan.direct.length,
        escrowed: plan.escrowed.length,
      });
      try {
        const actions = buildFundActions(plan, { escrowAddress: ESCROW_ADDRESS });
        t.step("actions", actions);
        if (dryRun) {
          t.ok("proved", await executor.prepare(actions));
          t.end();
          setError(null);
          setBusy(null);
          setSent("dry-run");
          return;
        }
        const { transaction_hash } = await executor.invoke(actions);
        t.ok("submitted", { transaction_hash });
        t.end();
        // Written before the modal even closes. A payment you cannot find
        // again is a payment you cannot trust, and the pool will never be able
        // to list it for you — see lib/receipts.ts.
        recordReceipt({
          hash: transaction_hash,
          chainId: CHAIN_ID,
          account: connectedAddress,
          at: Date.now(),
          directCount: plan.direct.length,
          escrowedCount: plan.escrowed.length,
          totalFri: [...plan.direct, ...plan.escrowed]
            .reduce((sum, p) => sum + BigInt(p.amount), 0n)
            .toString(),
          token: STRK_TOKEN,
          feeFri: POOL_FEE_FRI.toString(),
          status: "pending",
        });
        setSent(transaction_hash);
      } catch (e) {
        t.fail("failed", e);
        fail(e);
      } finally {
        setBusy(null);
      }
    },
    [plan, executor, fail, connectedAddress],
  );

  const escrowMissing = plan !== null && plan.escrowed.length > 0 && ESCROW_ADDRESS === "";
  const canSend =
    plan !== null && !escrowMissing && (plan.escrowed.length === 0 || exported);

  return (
    <div className="space-y-6">
      {/* Prerequisites as banners, never as gates. */}
      {connection.status !== "connected" ? (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="text-sm text-text-secondary">
            Connect a wallet to send. It holds your keys and signs — this app never sees them.
          </p>
          <ConnectButton />
        </Card>
      ) : status.readiness === "wrong-network" ? (
        <Card className="border-caution/35 bg-caution-wash p-5">
          <p className="text-sm">
            This app is on <strong>{CHAIN_ID}</strong>, your wallet is on{" "}
            <strong>{status.walletChainId}</strong>. Switch networks and reconnect.
          </p>
        </Card>
      ) : !connection.support.supported ? (
        <Card className="border-caution/35 bg-caution-wash p-5">
          <p className="text-sm">{describeStrk20Support(connection.support)}</p>
        </Card>
      ) : null}

      {connection.status === "connected" ? (
        <BalanceCard registered={status.registration === "registered"} />
      ) : null}

      <Card className="p-6 sm:p-7">
        <div className="space-y-6">
          <TextAreaField
            label="Recipients"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={"0x04a1…  25\n0x07b2…  12.5"}
            hint="One address and amount per line. Paste straight from a spreadsheet."
          />

          {parsed.errors.length > 0 ? (
            <ul className="space-y-1 rounded-card border border-critical/35 bg-critical-wash p-3 text-xs">
              {parsed.errors.map((e) => (
                <li key={e.line}>
                  <span className="font-medium">Line {e.line}</span>: {e.reason}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Refund address"
              value={refund}
              onChange={(e) => setRefund(e.target.value)}
              mono
              placeholder={connectedAddress === "" ? "0x…" : "your connected wallet"}
              hint="Where unclaimed payments return when the window closes."
            />
            <TextField
              label="Claim window (days)"
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              inputMode="numeric"
              hint="0 never expires, and can never be refunded."
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
            <p className="text-sm text-text-secondary">
              {parsed.recipients.length === 0 ? (
                "Add recipients to continue."
              ) : (
                <>
                  <span className="tabular font-medium text-text-primary">
                    {parsed.recipients.length}
                  </span>{" "}
                  recipient{parsed.recipients.length === 1 ? "" : "s"} ·{" "}
                  <span className="tabular font-medium text-text-primary">
                    {formatUnits(total)} STRK
                  </span>{" "}
                  · {feeLabel} fee, once
                </>
              )}
            </p>
            <Button
              size="lg"
              disabled={parsed.recipients.length === 0 || busy !== null || executor === null}
              onClick={() => void review()}
            >
              {busy ?? "Review payment"}
              <ArrowRight className="size-[18px]" />
            </Button>
          </div>
        </div>
      </Card>

      {error ? (
        <div className="rounded-card border border-critical/35 bg-critical-wash p-4 text-sm leading-relaxed whitespace-pre-line">
          {error}
        </div>
      ) : null}

      <Modal
        open={confirming && plan !== null}
        onClose={() => setConfirming(false)}
        title={sent && sent !== "dry-run" ? "Payment sent" : "Confirm payment"}
        description={
          sent && sent !== "dry-run"
            ? "Share each claim link with its recipient — the link is the only thing that unlocks their payment."
            : `One transaction, one ${feeLabel} fee, however many people it pays.`
        }
      >
        {plan !== null ? (
          <div className="space-y-5">
            <dl className="space-y-2 text-sm">
              <Row label="Total" value={`${formatUnits(total)} STRK`} />
              <Row label="Paid directly" value={String(plan.direct.length)} />
              <Row label="By claim link" value={String(plan.escrowed.length)} />
              <Row label="Pool fee" value={feeLabel} />
            </dl>

            {[...statuses.values()].filter((s) => s === "unknown").length > 0 ? (
              <p className="text-xs text-text-muted">
                Some recipients could not be checked, so they are paid by claim link. That always
                works.
              </p>
            ) : null}

            {plan.escrowed.length > 0 && ESCROW_ADDRESS === "" ? (
              <div className="rounded-card border border-caution/35 bg-caution-wash p-4 text-sm">
                <p className="font-medium">
                  {plan.escrowed.length} recipient{plan.escrowed.length === 1 ? " is" : "s are"} not
                  in the pool yet
                </p>
                <p className="mt-1 text-text-secondary">
                  They would be paid by claim link, which needs the escrow contract — and it is not
                  deployed on {CHAIN_ID}. Pay someone who already uses the pool, or remove them
                  from the list.
                </p>
              </div>
            ) : null}

            {plan.escrowed.length > 0 && ESCROW_ADDRESS !== "" && !sent ? (
              <div
                className={`rounded-card border p-4 text-sm ${
                  exported
                    ? "border-positive/35 bg-positive-wash"
                    : "border-caution/35 bg-caution-wash"
                }`}
              >
                <p className="font-medium">
                  {exported ? "Links saved" : "Save the claim links first"}
                </p>
                <p className="mt-1 text-text-secondary">
                  {exported
                    ? "Downloading them moved no money. Nothing is paid until you send below."
                    : "These secrets exist only in this browser. Without them nobody can claim."}
                </p>
                <Button variant="secondary" size="sm" className="mt-3" onClick={exportLinks}>
                  <Download className="size-4" />
                  {exported ? "Download again" : "Download claim links"}
                </Button>
              </div>
            ) : null}

            {sent === "dry-run" ? (
              <p className="flex items-center gap-2 rounded-card border border-positive/35 bg-positive-wash p-3 text-sm">
                <Check className="size-4 shrink-0 text-positive" />
                Proved cleanly without submitting.
              </p>
            ) : null}

            {sent && sent !== "dry-run" ? (
              <a
                href={VOYAGER_TX_URL(sent)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm text-accent underline underline-offset-2"
              >
                {shortenFelt(sent, 10, 8)}
                <External className="size-4" />
              </a>
            ) : null}

            {busy ? <p className="text-sm text-text-secondary">{busy}</p> : null}

            {!sent || sent === "dry-run" ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={busy !== null || escrowMissing}
                  onClick={() => void send(true)}
                >
                  Dry run
                </Button>
                <Button disabled={busy !== null || !canSend} onClick={() => void send(false)}>
                  Send payment
                </Button>
              </div>
            ) : (
              <Button variant="secondary" onClick={exportLinks}>
                <Download className="size-4" />
                Download links again
              </Button>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-text-muted">{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
    </div>
  );
}
