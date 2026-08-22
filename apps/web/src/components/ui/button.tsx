"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium " +
  "transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40";

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
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileHover={props.disabled ? undefined : lift}
      whileTap={props.disabled ? undefined : press}
      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
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
