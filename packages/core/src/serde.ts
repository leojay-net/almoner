import { num } from "starknet";

/**
 * A single calldata entry: a literal felt as hex, or a wallet-resolved
 * placeholder such as `${openNoteIds[0]}` or `${poolAddress}`.
 */
export type CalldataItem = string;

/** Builds the `${openNoteIds[N]}` placeholder the wallet substitutes at assembly time. */
export function openNoteIdPlaceholder(index: number): CalldataItem {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`open note index must be a non-negative integer, got ${index}`);
  }
  return `\${openNoteIds[${index}]}`;
}

/** The `${poolAddress}` placeholder. */
export const POOL_ADDRESS_PLACEHOLDER: CalldataItem = "${poolAddress}";

export function felt(value: string | bigint | number): CalldataItem {
  return num.toHex(BigInt(value));
}

/** Cairo `Span<T>` serializes as its length followed by each element. */
export function span(items: readonly CalldataItem[][]): CalldataItem[] {
  return [felt(items.length), ...items.flat()];
}

/** A unit enum variant serializes as its declaration index. */
export function enumVariant(index: number): CalldataItem {
  return felt(index);
}
