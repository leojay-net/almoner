"use client";

import { motion } from "motion/react";

import { Check } from "@/components/icons";

export type StepState = "done" | "active" | "locked";

export interface StepDef {
  id: string;
  label: string;
}

/**
 * Progress rail.
 *
 * Shows the whole sequence up front, because the thing that makes a multi-step
 * task feel long is not knowing how many steps remain. Completed steps stay
 * visible and clickable so a decision can be revisited without starting over.
 */
export function Stepper({
  steps,
  states,
  onSelect,
}: {
  steps: readonly StepDef[];
  states: Record<string, StepState>;
  onSelect?: (id: string) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
      {steps.map((step, index) => {
        const state = states[step.id] ?? "locked";
        const clickable = state === "done" && onSelect !== undefined;
        return (
          <li key={step.id} className="flex items-center gap-2">
            <button
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onSelect(step.id) : undefined}
              className={`flex items-center gap-2.5 rounded-full px-2.5 py-1.5 transition-colors ${
                clickable ? "hover:bg-surface-hover" : "cursor-default"
              }`}
            >
              <span
                className={`relative flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                  state === "done"
                    ? "border-positive/40 bg-positive-wash text-positive"
                    : state === "active"
                      ? "border-accent bg-accent text-accent-contrast"
                      : "border-line text-text-muted"
                }`}
              >
                {state === "done" ? (
                  <motion.span
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Check className="size-3.5" />
                  </motion.span>
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={`text-sm whitespace-nowrap transition-colors ${
                  state === "locked"
                    ? "text-text-muted"
                    : state === "active"
                      ? "font-medium text-text-primary"
                      : "text-text-secondary"
                }`}
              >
                {step.label}
              </span>
            </button>
            {index < steps.length - 1 ? (
              <span aria-hidden className="hidden h-px w-6 bg-line sm:block" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
