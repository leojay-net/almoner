"use client";

import { useCallback, useState } from "react";
import type { STRK20_ACTION } from "@starknet-io/types-js";
import { parseDecimalAmount } from "@almoner/core";
import { describeStrk20Support } from "@almoner/strk20-capability";

import { POOL_FEE_FRI, STRK_TOKEN, VOYAGER_TX_URL } from "@/lib/chain";
import { formatUnits, shortenFelt } from "@/lib/format";
import { useWallet } from "@/lib/wallet-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";

type State =
  | { kind: "idle" }
  | { kind: "working"; label: string }
  | { kind: "done"; hash: string }
  | { kind: "error"; message: string };

/**
 * Moving public STRK into the pool.
 *
 * Nothing else in Almoner works without this: a batch is funded from a shielded
 * balance, and a fresh account has none. Shielding is a public leg by design -
 * the depositing address and amount are visible on-chain. Privacy begins after.
 */
export function ShieldPanel() {
  const [amount, setAmount] = useState("10");
  const [state, setState] = useState<State>({ kind: "idle" });

  const { connection } = useWallet();

  const shield = useCallback(
    async () => {
      let value: bigint;
      try {
        value = parseDecimalAmount(amount, 18);
        if (value <= 0n) throw new Error("amount must be greater than zero");
      } catch (error) {
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "invalid amount",
        });
        return;
      }

      if (connection.status !== "connected") {
        setState({ kind: "error", message: "Connect a wallet first." });
        return;
      }
      if (!connection.support.supported) {
        setState({ kind: "error", message: describeStrk20Support(connection.support) });
        return;
      }

      try {
        const { account } = connection;
        // A shield is two prompts: the ERC-20 approve has to land on-chain before
        // the private deposit. Saying so up front stops the second prompt reading
        // as a duplicate-transaction bug.
        setState({ kind: "working", label: "Approve, then confirm the deposit - two prompts" });

        const actions: STRK20_ACTION[] = [
          { type: "deposit", token: STRK_TOKEN, amount: `0x${value.toString(16)}` },
        ];
        const { transaction_hash } = await account.strk20InvokeTransaction(actions);
        setState({ kind: "done", hash: transaction_hash });
      } catch (error) {
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [amount, connection],
  );

  const busy = state.kind === "working";
  const ready = connection.status === "connected" && connection.support.supported;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <TextField
          label="Amount to shield"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          hint={
            <>
              Keep at least {formatUnits(POOL_FEE_FRI)} STRK unshielded for the pool fee on your
              next transaction - wallet flows sponsor gas but not the pool fee.
            </>
          }
        />
      </Card>

      {connection.status === "connected" ? (
        <Button size="lg" disabled={!ready} loading={busy} onClick={() => void shield()}>
          {`Shield ${amount || "0"} STRK`}
        </Button>
      ) : (
        <p className="rounded-card border border-caution/35 bg-caution-wash p-4 text-sm">
          Connect a wallet to shield. Use the button in the top right.
        </p>
      )}

      {state.kind === "working" ? (
        <p className="text-sm text-text-secondary">{state.label}</p>
      ) : null}

      {state.kind === "done" ? (
        <div className="rounded-card border border-positive/35 bg-positive-wash p-4 text-sm">
          <Pill tone="positive">Shielded</Pill>
          <p className="mt-2">
            <a
              href={VOYAGER_TX_URL(state.hash)}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {shortenFelt(state.hash, 10, 8)}
            </a>
          </p>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <p className="rounded-card border border-critical/35 bg-critical-wash p-4 text-sm">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
