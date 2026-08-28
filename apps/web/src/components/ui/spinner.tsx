/**
 * Indeterminate activity indicator.
 *
 * Inherits `currentColor` so it reads correctly on every button variant without
 * a colour prop — a spinner that has to be told what colour it is will
 * eventually be told wrong.
 *
 * The track/arc pair rather than a bare arc: at 14px a single stroke reads as a
 * rendering artefact, while a faint full ring plus a bright quarter reads
 * unmistakably as motion even at small sizes.
 */
export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      data-spinner=""
      className={`shrink-0 animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2.5" opacity="0.22" />
      <path
        d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * A spinner with a label, for inline status lines.
 *
 * `aria-live="polite"` because the text changes as work progresses ("Proving",
 * "Confirm in your wallet") and a screen reader user needs those transitions —
 * they are the only signal that anything is happening.
 */
export function Working({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={`flex items-center gap-2.5 text-sm text-text-secondary ${className}`}
      aria-live="polite"
    >
      <Spinner className="size-4 text-accent" />
      {children}
    </p>
  );
}
