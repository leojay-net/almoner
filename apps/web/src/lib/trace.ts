"use client";

/**
 * Console tracing for wallet interactions.
 *
 * Wallet failures are opaque by nature: the error crosses an extension boundary
 * and arrives stripped of context. Tracing records what we sent, in what order,
 * and how long each stage took, so a failure can be located rather than guessed
 * at. The raw error object is logged alongside the formatted text — devtools can
 * expand it, and the expandable form usually carries fields that stringify away.
 */

const STYLE = {
  scope: "color:#319cfc;font-weight:600",
  ok: "color:#009f63;font-weight:600",
  fail: "color:#c92e3b;font-weight:600",
  dim: "color:#8a8f98",
};

export interface Tracer {
  /** A stage beginning, with any payload worth seeing. */
  step: (label: string, data?: unknown) => void;
  /** A stage that succeeded. */
  ok: (label: string, data?: unknown) => void;
  /** A stage that failed. Logs the raw error too, for expansion in devtools. */
  fail: (label: string, error: unknown) => void;
  end: () => void;
}

export function trace(scope: string, context?: Record<string, unknown>): Tracer {
  const started = performance.now();
  const since = () => `+${Math.round(performance.now() - started)}ms`;

  console.groupCollapsed(`%c[almoner] ${scope}`, STYLE.scope);
  if (context) console.log("%ccontext", STYLE.dim, context);

  return {
    step(label, data) {
      console.log(`%c→ ${label} %c${since()}`, STYLE.dim, STYLE.dim);
      if (data !== undefined) console.log(data);
    },
    ok(label, data) {
      console.log(`%c✓ ${label} %c${since()}`, STYLE.ok, STYLE.dim);
      if (data !== undefined) console.log(data);
    },
    fail(label, error) {
      console.log(`%c✕ ${label} %c${since()}`, STYLE.fail, STYLE.dim);
      // Both forms on purpose: the object is expandable and keeps non-enumerable
      // fields, the JSON survives copy-paste into a bug report.
      console.error(error);
      try {
        console.log(
          "%cserialised",
          STYLE.dim,
          JSON.stringify(error, Object.getOwnPropertyNames(Object(error)), 2),
        );
      } catch {
        /* some errors are not serialisable; the object above is enough */
      }
      console.groupEnd();
    },
    end() {
      console.groupEnd();
    },
  };
}
