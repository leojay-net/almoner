import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "positive" | "caution" | "critical";

const tones: Record<Tone, string> = {
  neutral: "border-line-strong text-text-secondary",
  accent: "border-accent/35 bg-accent-wash text-accent",
  positive: "border-positive/35 bg-positive-wash text-positive",
  caution: "border-caution/35 bg-caution-wash text-caution",
  critical: "border-critical/35 bg-critical-wash text-critical",
};

/**
 * Status pill. Carries state, never decoration — if it does not tell the reader
 * something they act on, it should not exist.
 */
export function Pill({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
