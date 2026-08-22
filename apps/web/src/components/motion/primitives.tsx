"use client";

import { motion, useReducedMotion, type HTMLMotionProps, type Variants } from "motion/react";
import type { ReactNode } from "react";

/**
 * Motion vocabulary.
 *
 * Three rules, borrowed from the tools this product sits next to:
 *   1. Everything eases out. Nothing eases in — entering content should decelerate
 *      into place, not accelerate at the viewer.
 *   2. Nothing decorative moves. Motion signals state change, hierarchy or
 *      causality; if it does none of those it is removed.
 *   3. Fast. 150–400ms. Anything slower reads as lag on a tool people use daily.
 *
 * Every helper collapses to a plain fade when the OS asks for reduced motion.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

export const DURATION = {
  fast: 0.16,
  base: 0.28,
  slow: 0.45,
} as const;

/** Rise-and-fade, the default entrance for anything that appears in place. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE },
  },
};

/** Parent that releases its children in sequence rather than all at once. */
export const stagger = (gap = 0.055, delay = 0): Variants => ({
  hidden: {},
  visible: {
    transition: { staggerChildren: gap, delayChildren: delay },
  },
});

interface RevealProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
  /** Replay whenever it scrolls back into view. Off by default — replaying is noise. */
  repeat?: boolean;
  delay?: number;
}

/** Reveals on scroll, once, slightly before the element reaches the viewport. */
export function Reveal({ children, repeat = false, delay = 0, ...props }: RevealProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: !repeat, margin: "0px 0px -12% 0px" }}
      variants={
        reduced
          ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
          : {
              hidden: { opacity: 0, y: 18 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { duration: DURATION.slow, ease: EASE, delay },
              },
            }
      }
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Staggered list container. Children should use {@link RevealItem}. */
export function RevealGroup({
  children,
  gap = 0.055,
  delay = 0,
  ...props
}: RevealProps & { gap?: number }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      variants={stagger(gap, delay)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, ...props }: HTMLMotionProps<"div">) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      variants={reduced ? { hidden: { opacity: 0 }, visible: { opacity: 1 } } : rise}
      {...props}
    >
      {children}
    </motion.div>
  );
}
