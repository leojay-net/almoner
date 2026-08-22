"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Adds a cursor-following highlight. Reserve it for cards that are targets. */
  interactive?: boolean;
}

/**
 * Surface primitive.
 *
 * The interactive variant tracks the pointer with a soft radial highlight. It is
 * a single radial-gradient on a pseudo-surface rather than a shadow stack, so it
 * costs one composited layer and never repaints the border.
 */
export function Card({ children, className = "", interactive = false }: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [glow, setGlow] = useState({ x: -200, y: -200, on: false });

  const onMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!interactive || reduced) return;
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      setGlow({ x: event.clientX - rect.left, y: event.clientY - rect.top, on: true });
    },
    [interactive, reduced],
  );

  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={() => setGlow((g) => ({ ...g, on: false }))}
      whileHover={interactive && !reduced ? { y: -2 } : undefined}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={`relative overflow-hidden rounded-panel border border-line bg-surface ${className}`}
    >
      {interactive ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            opacity: glow.on ? 1 : 0,
            background: `radial-gradient(340px circle at ${glow.x}px ${glow.y}px, var(--accent-wash), transparent 70%)`,
          }}
        />
      ) : null}
      <div className="relative">{children}</div>
    </motion.div>
  );
}
