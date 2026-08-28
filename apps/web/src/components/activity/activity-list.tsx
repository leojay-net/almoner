"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Activity, ArrowRight, Check, Clock, Alert, External } from "@/components/icons";
import { Reveal } from "@/components/motion/primitives";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { CHAIN_ID, VOYAGER_TX_URL, tokenSymbol } from "@/lib/chain";
import { formatUnits, shortenFelt } from "@/lib/format";
import { useConfirmPending, useReceipts, type Receipt } from "@/lib/receipts";
import { useWallet } from "@/lib/wallet-context";

export function ActivityList() {
  const { connection } = useWallet();
  const address = connection.status === "connected" ? connection.address : null;
  const receipts = useReceipts(address);
  const confirm = useConfirmPending(receipts);

  // Ask the chain about anything still pending, once on mount and then on a
  // slow timer. A hash is not proof of settlement; a batch can still revert.
  useEffect(() => {
    confirm();
    const id = setInterval(confirm, 15_000);
    return () => clearInterval(id);
  }, [confirm]);

  if (receipts.length === 0) {
    return (
      <Reveal>
        <Card className="px-8 py-16 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-line bg-surface-raised">
            <Activity className="size-6 text-text-muted" />
          </div>
          <h2 className="mt-6 text-lg font-semibold">No payments yet</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-text-secondary">
            {address === null
              ? "Connect your wallet to see payments sent from this browser."
              : "Payments you send are recorded here on this device."}
          </p>
          <div className="mt-8">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
            >
              Send a payment
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </Card>
      </Reveal>
    );
  }

  return (
    <div className="space-y-3">
      {receipts.map((receipt, index) => (
        <Reveal key={receipt.hash} delay={index * 0.04}>
          <Row receipt={receipt} />
        </Reveal>
      ))}

      <p className="pt-4 text-xs leading-relaxed text-text-muted">
        This list lives in this browser. The pool cannot produce it — private transfers are
        encrypted to keys the chain does not hold, so no explorer or indexer can list who you paid.
        Each transaction below is public and permanent on {CHAIN_ID === "SN_SEPOLIA" ? "Sepolia" : "Starknet"}; the
        breakdown next to it is yours alone and is lost if you clear site data.
      </p>
    </div>
  );
}

function Row({ receipt }: { receipt: Receipt }) {
  const count = receipt.directCount + receipt.escrowedCount;
  const total = formatUnits(BigInt(receipt.totalFri));
  const symbol = tokenSymbol(receipt.token);

  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <p className="text-base font-semibold tabular-nums">
            {total} {symbol}
          </p>
          <StatusPill status={receipt.status} />
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          {count} recipient{count === 1 ? "" : "s"}
          {receipt.escrowedCount > 0 ? ` · ${receipt.escrowedCount} by claim link` : ""} ·{" "}
          {new Date(receipt.at).toLocaleString()}
        </p>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span className="text-text-muted tabular-nums">
          fee {formatUnits(BigInt(receipt.feeFri))} STRK
        </span>
        <a
          href={VOYAGER_TX_URL(receipt.hash)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-accent transition-colors hover:text-accent-hover"
        >
          {shortenFelt(receipt.hash, 8, 6)}
          <External className="size-3.5" />
        </a>
      </div>
    </Card>
  );
}

function StatusPill({ status }: { status: Receipt["status"] }) {
  if (status === "accepted") {
    return (
      <Pill tone="positive">
        <Check className="size-3" />
        Settled
      </Pill>
    );
  }
  if (status === "reverted") {
    return (
      <Pill tone="critical">
        <Alert className="size-3" />
        Reverted
      </Pill>
    );
  }
  return (
    <Pill tone="caution">
      <Clock className="size-3" />
      Pending
    </Pill>
  );
}
