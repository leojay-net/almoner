"use client";

/**
 * Wall-clock seconds as an external store.
 *
 * Reading `Date.now()` during render makes render non-deterministic and breaks
 * hydration, so time is treated as what it is — a mutable external source — and
 * read through `useSyncExternalStore`. The one-second tick also means an expiry
 * countdown closes on its own rather than waiting for an unrelated re-render.
 */
let cached = 0n;

export function subscribeToClock(onChange: () => void): () => void {
  const id = setInterval(onChange, 1000);
  return () => clearInterval(id);
}

export function getNowSeconds(): bigint {
  const seconds = BigInt(Math.floor(Date.now() / 1000));
  // Stable reference between ticks, or useSyncExternalStore would loop.
  if (seconds !== cached) cached = seconds;
  return cached;
}

/** Server render has no meaningful clock; 0 disables expiry checks until hydration. */
export function getServerNowSeconds(): bigint {
  return 0n;
}
