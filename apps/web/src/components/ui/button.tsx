"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Spinner } from "@/components/ui/spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium " +
  "transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 " +
  // A loading button is disabled, but dimming it to 40% takes the spinner with
  // it — the one element that must stay legible while it waits.
  "aria-[busy=true]:opacity-100";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-contrast hover:bg-accent-hover",
  secondary: "border border-line-strong bg-surface-raised text-text-primary hover:bg-surface-hover",
  ghost: "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
  danger: "border border-critical/40 bg-critical-wash text-critical hover:bg-critical/20",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-[0.9375rem]",
  lg: "h-14 px-7 text-base",
};

/** Press feedback: a small, fast scale. Enough to feel mechanical, not bouncy. */
const press = { scale: 0.975 };
const lift = { y: -1 };

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  size?: Size;
  /**
   * Shows a spinner and blocks interaction.
   *
   * The label stays mounted underneath at `opacity-0` rather than being
   * swapped out, so the button keeps its width. A button that shrinks from
   * "Send payment" to a spinner drags every control beside it sideways at the
   * exact moment the user is watching for a result.
   */
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  loading = false,
  children,
  ...props
}: ButtonProps) {
  const inert = loading || props.disabled === true;
  return (
    <motion.button
      whileHover={inert ? undefined : lift}
      whileTap={inert ? undefined : press}
      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
      disabled={inert}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner className="size-[1.15em]" />
        </span>
      ) : null}
      <span className={`inline-flex items-center gap-2 ${loading ? "opacity-0" : ""}`}>
        {children}
      </span>
    </motion.button>
  );
}

interface ButtonLinkProps {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
}: ButtonLinkProps) {
  return (
    <motion.span
      whileHover={lift}
      whileTap={press}
      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
      className="inline-flex"
    >
      <Link href={href} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}>
        {children}
      </Link>
    </motion.span>
  );
}
