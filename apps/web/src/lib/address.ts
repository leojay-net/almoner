import { num } from "starknet";

/** Canonical hex form, so padded and unpadded spellings compare and key alike. */
export function normalizeAddress(value: string | bigint): string {
  return num.toHex(BigInt(value));
}
