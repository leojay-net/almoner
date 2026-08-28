"use client";

import { useCallback, useState } from "react";

import { Shield, Spark } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { TextField } from "@/components/ui/field";
import { POOL_FEE_FRI, STRK_TOKEN, VOYAGER_TX_URL } from "@/lib/chain";
import { formatUnits, shortenFelt } from "@/lib/format";
import { explainWalletError, withWalletTimeout } from "@/lib/wallet-error";
import { trace } from "@/lib/trace";
import { useWallet } from "@/lib/wallet-context";
import type { STRK20_ACTION } from "@starknet-io/types-js";

/**
 * Your position in the pool, and the way to add to it.
 *
 * Adding funds is a modal rather than a step. It is something you do
 * occasionally, not a stage everyone must march through — and gating the whole
 * screen behind it made the app ask people who already had a balance to deposit
 * again.
 */
export function BalanceCard({ registered }: { registered: boolean }) {
  const { connection } = useWallet();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [reading, setReading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("25");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readBalance = useCallback(async () => {
    if (connection.status !== "connected") return;
    setReading(true);
    setError(null);
    try {
      // Reading balances prompts the wallet for consent, so it only happens when
      // someone asks for it — never on page load.
      const entries = await withWalletTimeout(connection.account.strk20Balances([STRK_TOKEN]), {
        seconds: 45,
        action: "read your private balance",
      });
      const entry = entries.find((e) => BigInt(e.token) === BigInt(STRK_TOKEN));
      setBalance(BigInt(entry?.balance ?? 0));
    } catch (e) {
      setError(explainWalletError(e, { feeLabel: `${formatUnits(POOL_FEE_FRI)} STRK` }));
    } finally {
      setReading(false);
    }
  }, [connection]);

  const addFunds = useCallback(async () => {
    if (connection.status !== "connected") return;
    setError(null);
    setDone(null);
    let value: bigint;
    try {
      value = BigInt(Math.round(Number(amount) * 1e18));
      if (value <= 0n) throw new Error("Enter an amount greater than zero.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid amount");
      return;
    }
    setBusy("Approve, then confirm the deposit — your wallet will ask twice");
    const t = trace("add funds", { amount, address: connection.address });
    try {
      const actions: STRK20_ACTION[] = [
        { type: "deposit", token: STRK_TOKEN, amount: `0x${value.toString(16)}` },
      ];
      t.step("actions", actions);
      const { transaction_hash } = await withWalletTimeout(
        connection.account.strk20InvokeTransaction(actions),
        { action: "add funds to the pool" },
      );
      t.ok("submitted", { transaction_hash });
      t.end();
      setDone(transaction_hash);
      setBalance(null);
    } catch (e) {
      t.fail("failed", e);
      setError(explainWalletError(e, { feeLabel: `${formatUnits(POOL_FEE_FRI)} STRK` }));
    } finally {
      setBusy(null);
    }
  }, [connection, amount]);

  return (
    <>
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="flex items-center gap-2 text-sm text-text-muted">
              <Shield className="size-4" />
              Private balance
            </p>
            <p className="tabular mt-2 text-heading font-semibold">
              {balance === null ? (
                <span className="text-text-muted">
                  {registered ? "—" : "Not set up"}
                </span>
              ) : (
                <>
                  {formatUnits(balance)}{" "}
                  <span className="text-lead font-normal text-text-muted">STRK</span>
                </>
              )}
            </p>
            <p className="mt-1.5 text-xs text-text-muted">
              {registered
                ? "Only you can read this. Your wallet holds the key."
                : "Add funds once to open a position in the pool."}
            </p>
          </div>
          <div className="flex gap-2">
            {registered ? (
              <Button variant="secondary" size="sm" disabled={reading} onClick={() => void readBalance()}>
                {reading ? "Reading…" : balance === null ? "Show" : "Refresh"}
              </Button>
            ) : null}
            <Button size="sm" onClick={() => setAdding(true)}>
              Add funds
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add funds"
        description="Move STRK into the pool. This part is public — the amount and your address are visible on-chain. What you do afterwards is not."
      >
        <div className="space-y-5">
          <TextField
            label="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            hint={`A ${formatUnits(POOL_FEE_FRI)} STRK pool fee applies to this transaction.`}
          />
          {busy ? <p className="text-sm text-text-secondary">{busy}</p> : null}
          {done ? (
            <p className="rounded-card border border-positive/35 bg-positive-wash p-3 text-sm">
              Added.{" "}
              <a
                href={VOYAGER_TX_URL(done)}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                {shortenFelt(done, 10, 8)}
              </a>
            </p>
          ) : null}
          {error ? (
            <p className="rounded-card border border-critical/35 bg-critical-wash p-3 text-sm whitespace-pre-line">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button disabled={busy !== null} onClick={() => void addFunds()}>
              <Spark className="size-4" />
              Add {amount || "0"} STRK
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
