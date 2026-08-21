import { isValidSecret, normalizeFelt } from "./commitments.js";

/** What a claim link carries to the recipient. */
export interface ClaimLinkPayload {
  /** Bearer secret. Whoever holds it can claim. */
  readonly secret: string;
  /** Token the allocation is denominated in. */
  readonly token: string;
  /** Optional, for display before the on-chain lookup returns. */
  readonly amount?: bigint;
}

const PARAM = { secret: "s", token: "t", amount: "a" } as const;

/**
 * Builds a claim link, carrying the secret in the URL **fragment**.
 *
 * The fragment is deliberate and load-bearing: browsers never send it to the
 * server. Putting a bearer secret in the path or query string would write it
 * into server access logs, proxy logs, `Referer` headers on every outbound link,
 * and any analytics that records URLs — from where anyone with log access could
 * drain the allocation.
 */
export function encodeClaimLink(baseUrl: string, payload: ClaimLinkPayload): string {
  if (!isValidSecret(payload.secret)) {
    throw new Error("claim link requires a valid non-zero secret");
  }
  if (BigInt(payload.token) === 0n) throw new Error("claim link requires a token address");

  const params = new URLSearchParams({
    [PARAM.secret]: normalizeFelt(payload.secret),
    [PARAM.token]: normalizeFelt(payload.token),
  });
  if (payload.amount !== undefined) {
    params.set(PARAM.amount, normalizeFelt(payload.amount));
  }

  const url = new URL(baseUrl);
  url.hash = params.toString();
  return url.toString();
}

/**
 * Parses the fragment of a claim link.
 *
 * Accepts a full URL or a bare fragment, with or without the leading `#`.
 * Returns `null` rather than throwing for anything malformed, because this runs
 * on user-pasted input and a bad link is an ordinary state, not an exception.
 */
export function decodeClaimLink(input: string): ClaimLinkPayload | null {
  const fragment = extractFragment(input);
  if (fragment === null || fragment.length === 0) return null;

  const params = new URLSearchParams(fragment);
  const secret = params.get(PARAM.secret);
  const token = params.get(PARAM.token);
  if (secret === null || token === null) return null;

  try {
    if (!isValidSecret(secret) || BigInt(token) === 0n) return null;
    const rawAmount = params.get(PARAM.amount);
    const amount = rawAmount === null ? undefined : BigInt(rawAmount);
    if (amount !== undefined && amount <= 0n) return null;

    return {
      secret: normalizeFelt(secret),
      token: normalizeFelt(token),
      ...(amount === undefined ? {} : { amount }),
    };
  } catch {
    return null;
  }
}

function extractFragment(input: string): string | null {
  const hashIndex = input.indexOf("#");
  if (hashIndex >= 0) return input.slice(hashIndex + 1);
  // A bare fragment with no marker, e.g. straight from `location.hash.slice(1)`.
  return input.includes("=") ? input : null;
}
