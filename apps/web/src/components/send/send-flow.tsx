"use client";

import { AnimatePresence } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import type { STRK20_ACTION } from "@starknet-io/types-js";
import {
  buildFundActions,
  encodeClaimLink,
  parseDecimalAmount,
  parseRecipients,
  planBatch,
  type BatchPlan,
  type Payout,
} from "@almoner/core";
import { describeStrk20Support } from "@almoner/strk20-capability";

import { ArrowRight, Check, Download, External } from "@/components/icons";
import { ConnectButton } from "@/components/shell/connect-button";
import { Blocker, Figure, StepPanel } from "@/components/send/steps";
import { Stepper, type StepState } from "@/components/send/stepper";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { CHAIN_ID, POOL_ADDRESS, POOL_FEE_FRI, STRK_TOKEN, VOYAGER_TX_URL } from "@/lib/chain";
import { ESCROW_ADDRESS } from "@/lib/escrow";
import { formatUnits, shortenFelt } from "@/lib/format";
import { checkRegistrations, type RegistrationStatus } from "@/lib/registration";
import { useAccountStatus } from "@/lib/account-status";
import { explainWalletError } from "@/lib/wallet-error";
import { trace } from "@/lib/trace";
import { useWallet } from "@/lib/wallet-context";
import { walletExecutor } from "@/lib/executor-wallet";
import { ROUTE } from "@/lib/executor";

type StepId = "connect" | "fund" | "recipients" | "review" | "send";

const STEPS = [
  { id: "connect", label: "Connect" },
  { id: "fund", label: "Fund balance" },
  { id: "recipients", label: "Recipients" },
  { id: "review", label: "Review" },
  { id: "send", label: "Send" },
] as const;

const SAMPLE = `0x047bC9Ab67CF0203341C13Bc97DCb13E7Fa790Ae8fC405b19F5004b4089Fb6c8, 5`;

type Busy = { label: string } | null;

/**
 * The whole send job, as one sequence.
 *
 * The previous design was a set of pages that each failed on its own and told
 * you to go somewhere else — you could only use it if you already knew that
 * shielding registers you, that registration is what creates a balance, and that
 * a batch is paid out of that balance. None of that is the payer's problem. Here
 * you say you want to pay someone, and anything missing is surfaced and resolved
 * in place, in order.
 */
export function SendFlow() {
  const { connection } = useWallet();
  const status = useAccountStatus();

  // Everything below is route-agnostic: it holds an executor, not a wallet.
  // Memoised so it is a stable dependency rather than a new object each render.
  const executor = useMemo(
    () =>
      connection.status === "connected"
        ? walletExecutor(connection.account, connection.wallet.name)
        : null,
    [connection],
  );

  const [shieldAmount, setShieldAmount] = useState("25");
  const [recipientText, setRecipientText] = useState(SAMPLE);
  const [refund, setRefund] = useState("");
  const [expiryDays, setExpiryDays] = useState("30");

  const [plan, setPlan] = useState<BatchPlan | null>(null);
  const [statuses, setStatuses] = useState<Map<string, RegistrationStatus>>(new Map());
  const [exported, setExported] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [dryRunOk, setDryRunOk] = useState(false);
  const [fundDryRunOk, setFundDryRunOk] = useState(false);
  const [sentHash, setSentHash] = useState<string | null>(null);
  const [visited, setVisited] = useState<StepId | null>(null);

  const parsed = useMemo(
    () => parseRecipients(recipientText, { decimals: 18 }),
    [recipientText],
  );
  const connectedAddress = connection.status === "connected" ? connection.address : "";
  const refundAddress = refund.trim() === "" ? connectedAddress : refund.trim();

  // Step completion is derived from the world, never stored — so reconnecting a
  // different wallet or losing a balance re-opens the right step automatically.
  const done: Record<StepId, boolean> = {
    connect: status.readiness === "ready" || status.readiness === "needs-funding",
    fund: status.readiness === "ready",
    recipients: plan !== null,
    review: plan !== null && (plan.escrowed.length === 0 || exported),
    send: sentHash !== null,
  };

  const firstIncomplete: StepId =
    (STEPS.find((s) => !done[s.id as StepId])?.id as StepId | undefined) ?? "send";
  const current: StepId = visited && done[visited] !== undefined ? visited : firstIncomplete;

  const states = Object.fromEntries(
    STEPS.map((s) => {
      const id = s.id as StepId;
      const state: StepState = id === current ? "active" : done[id] ? "done" : "locked";
      return [id, state];
    }),
  ) as Record<string, StepState>;

  const feeLabel = `${formatUnits(POOL_FEE_FRI)} STRK`;
  const fail = useCallback(
    (e: unknown) => setError(explainWalletError(e, { feeLabel })),
    [feeLabel],
  );

  const shield = useCallback(
    async (dryRun: boolean) => {
      if (executor === null || connection.status !== "connected") return;
      setError(null);
      setFundDryRunOk(false);
      let value: bigint;
      try {
        value = parseDecimalAmount(shieldAmount, 18);
        if (value <= 0n) throw new Error("Enter an amount greater than zero.");
      } catch (e) {
        fail(e);
        return;
      }
      setBusy({
        label: dryRun
          ? "Proving — nothing is submitted"
          : "Approve, then confirm the deposit — your wallet will ask twice",
      });
      const t = trace(dryRun ? "fund · dry run" : "fund · submit", {
        route: ROUTE,
        wallet: connection.wallet.name,
        address: connection.address,
        walletChainId: connection.chainId,
        appChainId: CHAIN_ID,
        walletApiVersions: connection.support.versions,
        pool: POOL_ADDRESS,
        token: STRK_TOKEN,
        amount: `${shieldAmount} STRK`,
      });
      try {
        const actions: STRK20_ACTION[] = [
          { type: "deposit", token: STRK_TOKEN, amount: `0x${value.toString(16)}` },
        ];
        t.step("actions built", actions);
        if (dryRun) {
          // Proving happens inside the wallet and costs nothing on-chain, so this
          // tests the wallet's proving service without spending anything.
          t.step(`calling ${executor!.kind} executor: prepare`);
          const prepared = await executor!.prepare(actions);
          t.ok("proved the deposit", prepared);
          t.end();
          setFundDryRunOk(true);
          return;
        }
        t.step(`calling ${executor!.kind} executor: invoke`);
        const result = await executor!.invoke(actions);
        t.ok("submitted", result);
        t.end();
        status.refresh();
        setVisited(null);
      } catch (e) {
        t.fail("wallet call failed", e);
        fail(e);
      } finally {
        setBusy(null);
      }
    },
    [executor, connection, shieldAmount, status, fail],
  );

  const review = useCallback(async () => {
    setError(null);
    if (parsed.recipients.length === 0) {
      setError("Add at least one recipient.");
      return;
    }
    try {
      if (BigInt(refundAddress) === 0n) throw new Error("Enter a refund address.");
    } catch {
      setError("That refund address is not valid.");
      return;
    }
    setBusy({ label: "Checking which recipients already use the pool…" });
    const t = trace("review · build plan", {
      recipients: parsed.recipients.length,
      refundAddress,
      expiryDays,
    });
    try {
      t.step("checking recipient registration on-chain");
      const found = await checkRegistrations(parsed.recipients.map((r) => r.address));
      t.ok("registration checked", Object.fromEntries(found));
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
      const built = planBatch(payouts, { refundRecipient: refundAddress, expiry });
      t.ok("plan built", {
        direct: built.direct.length,
        escrowed: built.escrowed.length,
        totals: Object.fromEntries([...built.totals].map(([k, v]) => [k, v.toString()])),
      });
      t.end();
      setPlan(built);
      setExported(false);
      setDryRunOk(false);
      setVisited(null);
    } catch (e) {
      t.fail("could not build the plan", e);
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
    setVisited(null);
  }, [plan]);

  const send = useCallback(
    async (dryRun: boolean) => {
      if (plan === null || executor === null) return;
      setError(null);
      setBusy({ label: dryRun ? "Proving the transaction…" : "Confirm in your wallet" });
      const t = trace(dryRun ? "send · dry run" : "send · submit", {
        wallet: connection.status === "connected" ? connection.wallet.name : null,
        walletChainId: connection.status === "connected" ? connection.chainId : null,
        appChainId: CHAIN_ID,
        escrow: ESCROW_ADDRESS,
        pool: POOL_ADDRESS,
        direct: plan.direct.length,
        escrowed: plan.escrowed.length,
      });
      try {
        const actions = buildFundActions(plan, { escrowAddress: ESCROW_ADDRESS });
        // The exact payload handed to the wallet, including the phase ordering
        // and any ${openNoteIds[N]} placeholders it has to resolve.
        t.step("actions built", actions);
        if (dryRun) {
          t.step(`calling ${executor!.kind} executor: prepare`);
          const prepared = await executor!.prepare(actions);
          t.ok("proved the batch", prepared);
          t.end();
          setDryRunOk(true);
        } else {
          t.step(`calling ${executor!.kind} executor: invoke`);
          const { transaction_hash } = await executor!.invoke(actions);
          t.ok("submitted", { transaction_hash });
          t.end();
          setSentHash(transaction_hash);
        }
      } catch (e) {
        t.fail("wallet call failed", e);
        fail(e);
      } finally {
        setBusy(null);
      }
    },
    [plan, executor, connection, fail],
  );

  return (
    <div className="space-y-8">
      <Stepper steps={STEPS} states={states} onSelect={(id) => setVisited(id as StepId)} />

      <AnimatePresence mode="wait">
        {current === "connect" ? (
          <StepPanel
            key="connect"
            title="Connect your wallet"
            description="Your wallet holds the viewing key and generates the proof for every private action. This app never sees either."
          >
            {status.readiness === "wrong-network" ? (
              <Blocker title="Your wallet is on a different network">
                This app is configured for <strong>{CHAIN_ID}</strong>, but your wallet reports{" "}
                <strong>{status.walletChainId}</strong>. Nothing here will work until they match —
                switch networks in the wallet, then reconnect.
              </Blocker>
            ) : status.readiness === "wallet-unsupported" && connection.status === "connected" ? (
              <Blocker title="This wallet cannot sign STRK20 actions">
                {describeStrk20Support(connection.support)} Disconnect and try another wallet —
                Ready is the one known to support it.
              </Blocker>
            ) : (
              <ConnectButton />
            )}
          </StepPanel>
        ) : null}

        {current === "fund" ? (
          <StepPanel
            key="fund"
            title="Fund your private balance"
            description="Payments come out of a balance held inside the pool, and this account does not have one yet. Moving STRK in also registers you, which is what lets you be paid privately later."
            footer={
              <>
                <Button
                  size="lg"
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => void shield(true)}
                >
                  Test first
                </Button>
                <Button size="lg" disabled={busy !== null} onClick={() => void shield(false)}>
                  {busy ? busy.label : `Move ${shieldAmount || "0"} STRK in`}
                </Button>
              </>
            }
          >
            <div className="max-w-sm">
              <TextField
                label="Amount"
                value={shieldAmount}
                onChange={(e) => setShieldAmount(e.target.value)}
                inputMode="decimal"
                hint={`Cover what you plan to send plus the ${formatUnits(POOL_FEE_FRI)} STRK pool fee. You can always add more.`}
              />
            </div>
            {fundDryRunOk ? (
              <p className="mt-5 flex items-center gap-2 rounded-card border border-positive/35 bg-positive-wash p-4 text-sm">
                <Check className="size-4 shrink-0 text-positive" />
                Proved cleanly without submitting. Your wallet can do this — go ahead.
              </p>
            ) : null}
            {status.registration === "unregistered" ? (
              <Blocker title="Register with the pool first">
                <p>
                  Every pool user registers a viewing key once, on-chain, before they can hold a
                  private balance. This account has not.
                </p>
                <p className="mt-2">
                  A dapp cannot do this for you — registration is not one of the actions the
                  Wallet API exposes. Do it in your wallet&rsquo;s privacy section, or at{" "}
                  <a
                    href="https://strk20.starknet.io/app"
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline underline-offset-2"
                  >
                    strk20.starknet.io/app
                  </a>
                  , then reload this page.
                </p>
              </Blocker>
            ) : null}
            <p className="mt-5 text-sm leading-relaxed text-text-secondary">
              This step is public: the amount and your address are visible on-chain. Everything
              you do afterwards is not. <strong>Test first</strong> proves the transaction inside
              your wallet without submitting it or spending anything — worth doing once to
              confirm the wallet can reach its proving service.
            </p>
          </StepPanel>
        ) : null}

        {current === "recipients" && ESCROW_ADDRESS === "" ? (
          <StepPanel
            key="no-escrow"
            title="Escrow not deployed on this network"
            description={`Paying someone who has never used the pool needs the Almoner escrow contract, and it is not deployed on ${CHAIN_ID} yet.`}
          >
            <Blocker title="You can still test the earlier steps">
              Funding your private balance works without the escrow — it is only needed once you
              pay a recipient who is not already registered with the pool.
            </Blocker>
          </StepPanel>
        ) : current === "recipients" ? (
          <StepPanel
            key="recipients"
            title="Who are you paying?"
            description="One address and amount per line. Paste straight from a spreadsheet — anyone who has never used the pool is handled automatically."
            footer={
              <Button
                size="lg"
                disabled={busy !== null || parsed.recipients.length === 0}
                onClick={() => void review()}
              >
                {busy ? busy.label : "Continue"}
                <ArrowRight className="size-[18px]" />
              </Button>
            }
          >
            <div className="space-y-6">
              <TextAreaField
                label="Recipients"
                value={recipientText}
                onChange={(e) => setRecipientText(e.target.value)}
                rows={6}
              />
              {parsed.errors.length > 0 ? (
                <ul className="space-y-1 rounded-card border border-critical/35 bg-critical-wash p-3 text-xs">
                  {parsed.errors.map((err) => (
                    <li key={err.line}>
                      <span className="font-medium">Line {err.line}</span>: {err.reason}
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
                  hint="Where anything unclaimed returns when the window closes."
                />
                <TextField
                  label="Claim window (days)"
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                  inputMode="numeric"
                  hint="0 never expires, and can never be refunded."
                />
              </div>
              <p className="text-sm text-text-secondary">
                {parsed.recipients.length} recipient{parsed.recipients.length === 1 ? "" : "s"},{" "}
                {formatUnits(parsed.recipients.reduce((sum, r) => sum + r.amount, 0n))} STRK.
              </p>
            </div>
          </StepPanel>
        ) : null}

        {current === "review" && plan !== null ? (
          <StepPanel
            key="review"
            title="Save the claim links"
            description="Recipients who have never used the pool are paid through an escrow they unlock with a link. Those links exist only in this browser — download them before sending, or nobody can claim."
            footer={
              <>
                <Button size="lg" onClick={exportLinks}>
                  <Download className="size-[18px]" />
                  {exported ? "Download again" : "Download claim links"}
                </Button>
                {exported ? (
                  <Button size="lg" variant="secondary" onClick={() => setVisited("send")}>
                    Continue
                    <ArrowRight className="size-[18px]" />
                  </Button>
                ) : null}
              </>
            }
          >
            <Summary plan={plan} statuses={statuses} />
            {plan.escrowed.length === 0 ? (
              <p className="mt-6 text-sm text-text-secondary">
                Every recipient already uses the pool, so there are no links to save. Continue
                when ready.
              </p>
            ) : null}
          </StepPanel>
        ) : null}

        {current === "send" && plan !== null ? (
          <StepPanel
            key="send"
            title={sentHash ? "Payment sent" : "Send the payment"}
            description={
              sentHash
                ? "The batch is on-chain. Share each claim link with its recipient — the link is the only thing that unlocks their payment."
                : `One transaction, one ${formatUnits(POOL_FEE_FRI)} STRK fee, however many people it pays. Try it as a dry run first — that proves the transaction without submitting it.`
            }
            footer={
              sentHash ? (
                <>
                  <Button variant="secondary" onClick={exportLinks}>
                    <Download className="size-[18px]" />
                    Download links again
                  </Button>
                  <a
                    href={VOYAGER_TX_URL(sentHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-line-strong px-5 py-2.5 text-sm font-medium transition hover:bg-surface-hover"
                  >
                    View transaction
                    <External className="size-4" />
                  </a>
                </>
              ) : (
                <>
                  <Button
                    size="lg"
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={() => void send(true)}
                  >
                    Dry run
                  </Button>
                  <Button size="lg" disabled={busy !== null} onClick={() => void send(false)}>
                    {busy ? busy.label : "Send payment"}
                  </Button>
                </>
              )
            }
          >
            <Summary plan={plan} statuses={statuses} />
            {dryRunOk && !sentHash ? (
              <p className="mt-6 flex items-center gap-2 rounded-card border border-positive/35 bg-positive-wash p-4 text-sm">
                <Check className="size-4 shrink-0 text-positive" />
                Dry run succeeded — the transaction proved cleanly without being submitted.
              </p>
            ) : null}
            {sentHash ? (
              <p className="mt-6 font-mono text-xs break-all text-text-muted">
                {shortenFelt(sentHash, 14, 10)}
              </p>
            ) : null}
          </StepPanel>
        ) : null}
      </AnimatePresence>

      {error ? (
        <div className="rounded-card border border-critical/35 bg-critical-wash p-4 text-sm leading-relaxed whitespace-pre-line">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function Summary({
  plan,
  statuses,
}: {
  plan: BatchPlan;
  statuses: Map<string, RegistrationStatus>;
}) {
  const total = [...plan.totals.values()].reduce((a, b) => a + b, 0n);
  const unknown = [...statuses.values()].filter((s) => s === "unknown").length;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Total" value={`${formatUnits(total)} STRK`} />
        <Figure label="Paid directly" value={String(plan.direct.length)} />
        <Figure label="By claim link" value={String(plan.escrowed.length)} />
        <Figure label="Fee" value={`${formatUnits(POOL_FEE_FRI)} STRK`} tone="accent" />
      </div>
      {unknown > 0 ? (
        <p className="text-sm text-text-secondary">
          {unknown} recipient{unknown === 1 ? "" : "s"} could not be checked, so they are paid by
          claim link. That always works.
        </p>
      ) : null}
    </div>
  );
}
