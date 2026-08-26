"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/**
 * A step's body.
 *
 * Only ever one is on screen. Showing every step's form at once is what made the
 * old pages feel scattered — a wall of inputs where most are irrelevant to what
 * you are doing right now.
 */
export function StepPanel({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-panel border border-line bg-surface p-6 sm:p-8"
    >
      <h2 className="text-heading font-semibold">{title}</h2>
      {description ? (
        <p className="mt-2.5 max-w-2xl leading-relaxed text-text-secondary">{description}</p>
      ) : null}
      <div className="mt-7">{children}</div>
      {footer ? <div className="mt-8 flex flex-wrap gap-3">{footer}</div> : null}
    </motion.section>
  );
}

/** Inline explanation of why the next action is blocked, with the way out. */
export function Blocker({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-caution/35 bg-caution-wash p-5">
      <p className="font-medium">{title}</p>
      <div className="mt-1.5 text-sm leading-relaxed text-text-secondary">{children}</div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Figure({ label, value, tone }: { label: string; value: string; tone?: "accent" }) {
  return (
    <div className="rounded-card border border-line p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`tabular mt-1.5 font-semibold ${tone === "accent" ? "text-accent" : ""}`}>
        {value}
      </p>
    </div>
  );
}
