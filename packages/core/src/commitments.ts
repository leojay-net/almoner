import { hash, num, shortString } from "starknet";

import { ALMONER_COMMITMENT_TAG } from "./constants.js";

/** Largest value a felt252 can hold. */
const FELT_PRIME = 2n ** 251n + 17n * 2n ** 192n + 1n;

/**
 * Generates a claim secret using the platform CSPRNG.
 *
 * Reduced into the felt field so it always round-trips through calldata. The
 * secret is the bearer token for an allocation: whoever holds it can claim, so
 * it must never be logged, persisted server-side, or put in a URL path that
 * lands in access logs.
 */
export function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  // Rejection-free reduction; the modulus bias is negligible at 256 bits into a
  // 252-bit field, and a zero secret is replaced rather than allowed.
  const reduced = value % FELT_PRIME;
  return num.toHex(reduced === 0n ? 1n : reduced);
}

/**
 * `poseidon(ALMONER_COMMITMENT_TAG, secret)` — the value published on-chain.
 *
 * Mirrors `compute_commitment_hash` in the Cairo escrow exactly.
 */
export function computeCommitmentHash(secret: string): string {
  const tag = shortString.encodeShortString(ALMONER_COMMITMENT_TAG);
  return hash.computePoseidonHashOnElements([tag, secret]);
}

/** True when two felt-ish values name the same number despite differing padding. */
export function feltEquals(left: string | bigint, right: string | bigint): boolean {
  return BigInt(left) === BigInt(right);
}

/** Normalizes an address or felt to canonical hex, so comparisons and keys agree. */
export function normalizeFelt(value: string | bigint): string {
  return num.toHex(BigInt(value));
}

/** Exposed so callers can check a secret is well-formed before building a batch. */
export function isValidSecret(secret: string): boolean {
  try {
    const value = BigInt(secret);
    return value > 0n && value < FELT_PRIME;
  } catch {
    return false;
  }
}
