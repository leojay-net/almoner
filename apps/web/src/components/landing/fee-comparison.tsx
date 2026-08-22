"use client";

import { motion, useInView } from "motion/react";
import { useRef, useState } from "react";

import { Counter } from "@/components/motion/counter";

const POOL_FEE = 6;

/**
 * The product's whole argument, made interactive.
 *
 * The pool charges a flat fee per transaction rather than per payment, so paying
 * N people in one batch stays at one fee while paying them separately scales
 * linearly. Dragging the recipient count is the fastest way to feel that, and it
 * is more convincing than any sentence about it.
 */
export function FeeComparison() {
  const [recipients, setRecipients] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -20% 0px" });

  const batched = POOL_FEE;
  const separate = POOL_FEE * recipients;
  const ratio = batched / separate;

  return (
    <div ref={ref} className="rounded-panel border border-line bg-surface p-6 sm:p-9">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm font-medium text-text-muted">Paying</p>
          <p className="mt-1 text-heading font-semibold">
            <Counter value={recipients} /> recipient{recipients === 1 ? "" : "s"}
          </p>
        </div>
        <label className="w-full max-w-xs">
          <span className="sr-only">Number of recipients</span>
          <input
            type="range"
            min={1}
            max={200}
            value={recipients}
            onChange={(event) => setRecipients(Number(event.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-hover accent-accent"
          />
        </label>
      </div>

      <div className="mt-10 space-y-7">
        <Bar
          label="Batched through Almoner"
          value={batched}
          max={separate}
          tone="accent"
          animate={inView}
          note="one transaction"
        />
        <Bar
          label="Paid one at a time"
          value={separate}
          max={separate}
          tone="muted"
          animate={inView}
          note={`${recipients} transaction${recipients === 1 ? "" : "s"}`}
        />
      </div>

      <div className="mt-9 border-t border-line pt-6">
        <p className="text-sm leading-relaxed text-text-secondary">
          {recipients === 1 ? (
            <>At one recipient there is nothing to amortise — the cost is identical.</>
          ) : (
            <>
              Batching costs{" "}
              <span className="tabular font-semibold text-accent">
                {ratio < 0.01 ? ratio.toFixed(3) : ratio.toFixed(2)}&times;
              </span>{" "}
              as much — a saving of{" "}
              <span className="tabular font-semibold text-text-primary">
                {(separate - batched).toLocaleString()} STRK
              </span>{" "}
              on a single payroll run.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  tone,
  note,
  animate,
}: {
  label: string;
  value: number;
  max: number;
  tone: "accent" | "muted";
  note: string;
  animate: boolean;
}) {
  const width = max === 0 ? 0 : Math.max((value / max) * 100, 1.5);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="tabular text-lg font-semibold">
          {value.toLocaleString()} <span className="text-sm font-normal text-text-muted">STRK</span>
        </p>
      </div>
      <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-surface-hover">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: animate ? `${width}%` : 0 }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          className={`h-full rounded-full ${tone === "accent" ? "bg-accent" : "bg-ink-600"}`}
        />
      </div>
      <p className="mt-2 text-xs text-text-muted">{note}</p>
    </div>
  );
}
