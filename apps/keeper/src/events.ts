import { hash, num } from "starknet";

import type { AllocationState, TrackedAllocation } from "./allocations.ts";

/**
 * Escrow event decoding.
 *
 * Layouts are taken from the compiled ABI, not assumed:
 *
 * ```
 * AllocationFunded    keys=[selector, commitment_hash, token]  data=[amount, expiry, refund_recipient]
 * AllocationClaimed   keys=[selector, commitment_hash, token]  data=[amount, note_id]
 * AllocationRefunded  keys=[selector, commitment_hash, token]  data=[amount, refund_recipient]
 * ```
 */
export const EVENT_SELECTOR = {
  funded: hash.getSelectorFromName("AllocationFunded"),
  claimed: hash.getSelectorFromName("AllocationClaimed"),
  refunded: hash.getSelectorFromName("AllocationRefunded"),
} as const;

export interface RawEvent {
  readonly keys: readonly string[];
  readonly data: readonly string[];
  readonly block_number?: number;
}

export type DecodedEvent =
  | { kind: "funded"; allocation: TrackedAllocation }
  | { kind: "claimed" | "refunded"; commitmentHash: string; blockNumber: number };

const normalize = (value: string) => num.toHex(BigInt(value));

/**
 * Decodes one escrow event, or returns `null` for anything unrecognised.
 *
 * Unknown events are skipped rather than thrown on: a contract upgrade that adds
 * an event should not halt the keeper.
 */
export function decodeEvent(event: RawEvent): DecodedEvent | null {
  const [selector, commitmentHashKey, tokenKey] = event.keys;
  if (selector === undefined || commitmentHashKey === undefined) return null;

  const commitmentHash = normalize(commitmentHashKey);
  const blockNumber = event.block_number ?? 0;
  const selectorHex = normalize(selector);

  if (selectorHex === normalize(EVENT_SELECTOR.funded)) {
    const [amount, expiry, refundRecipient] = event.data;
    if (
      tokenKey === undefined ||
      amount === undefined ||
      expiry === undefined ||
      refundRecipient === undefined
    ) {
      return null;
    }
    return {
      kind: "funded",
      allocation: {
        commitmentHash,
        token: normalize(tokenKey),
        amount: BigInt(amount),
        expiry: BigInt(expiry),
        refundRecipient: normalize(refundRecipient),
        state: "funded",
        fundedAtBlock: blockNumber,
      },
    };
  }

  if (selectorHex === normalize(EVENT_SELECTOR.claimed)) {
    return { kind: "claimed", commitmentHash, blockNumber };
  }
  if (selectorHex === normalize(EVENT_SELECTOR.refunded)) {
    return { kind: "refunded", commitmentHash, blockNumber };
  }
  return null;
}

/**
 * Folds events into the allocation map.
 *
 * Terminal states are sticky: once claimed or refunded, a later out-of-order or
 * replayed event cannot walk an allocation back to `funded` and make the keeper
 * try to refund money that has already moved.
 */
export function applyEvents(
  allocations: Map<string, TrackedAllocation>,
  events: readonly RawEvent[],
): { applied: number; skipped: number } {
  let applied = 0;
  let skipped = 0;

  for (const raw of events) {
    const decoded = decodeEvent(raw);
    if (decoded === null) {
      skipped += 1;
      continue;
    }

    if (decoded.kind === "funded") {
      const existing = allocations.get(decoded.allocation.commitmentHash);
      // A re-scanned funding event must not resurrect a settled allocation.
      if (existing === undefined || existing.state === "funded") {
        allocations.set(decoded.allocation.commitmentHash, decoded.allocation);
        applied += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    const existing = allocations.get(decoded.commitmentHash);
    if (existing === undefined) {
      // Claimed or refunded before we ever saw the funding — nothing to sweep.
      skipped += 1;
      continue;
    }
    const state: AllocationState = decoded.kind;
    allocations.set(decoded.commitmentHash, { ...existing, state });
    applied += 1;
  }

  return { applied, skipped };
}
