/**
 * Placeholder for content that is being fetched.
 *
 * Used only where the real shape is known ahead of time — a balance, a row —
 * so the layout does not jump when the value lands. Where the shape is unknown,
 * a spinner is the honest choice; a skeleton would be inventing a promise about
 * what is coming.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      className={`block animate-pulse rounded-md bg-line motion-reduce:animate-none ${className}`}
      aria-hidden="true"
    />
  );
}
