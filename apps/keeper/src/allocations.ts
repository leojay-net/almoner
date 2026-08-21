/**
 * Allocation bookkeeping and sweep selection.
 *
 * Pure logic, deliberately separated from chain access so the decision of *what*
 * to refund can be tested without a node. Getting this wrong spends real gas on
 * transactions that revert, or worse, leaves money stranded past its expiry.
 */

export type AllocationState = "funded" | "claimed" | "refunded";

export interface TrackedAllocation {
  readonly commitmentHash: string;
  readonly token: string;
  readonly amount: bigint;
  /** Unix seconds; `0` never expires and is never sweepable. */
  readonly expiry: bigint;
  readonly refundRecipient: string;
  readonly state: AllocationState;
  /** Block the funding event was seen in. */
  readonly fundedAtBlock: number;
}

export interface SweepOptions {
  /** Current chain time, in unix seconds. */
  readonly nowSeconds: bigint;
  /**
   * Seconds to wait past expiry before sweeping. Block timestamps drift from
   * wall clock, and a refund submitted a moment early reverts and wastes gas.
   */
  readonly graceSeconds?: bigint;
  /** Maximum commitments per `refund_batch` call. */
  readonly batchSize?: number;
}

export const DEFAULT_GRACE_SECONDS = 120n;
export const DEFAULT_BATCH_SIZE = 25;

/** True when an allocation is unclaimed, expiring, and past its grace period. */
export function isSweepable(
  allocation: TrackedAllocation,
  nowSeconds: bigint,
  graceSeconds: bigint = DEFAULT_GRACE_SECONDS,
): boolean {
  if (allocation.state !== "funded") return false;
  if (allocation.expiry === 0n) return false;
  return nowSeconds >= allocation.expiry + graceSeconds;
}

/**
 * Groups sweepable allocations into `refund_batch` sized chunks.
 *
 * `refund_batch` reverts entirely if any member is not refundable, so batches
 * stay small: one unexpected state change costs a chunk, not the whole sweep.
 */
export function selectSweepBatches(
  allocations: Iterable<TrackedAllocation>,
  options: SweepOptions,
): string[][] {
  const grace = options.graceSeconds ?? DEFAULT_GRACE_SECONDS;
  const size = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (size < 1) throw new RangeError("batchSize must be at least 1");

  const due = [...allocations]
    .filter((allocation) => isSweepable(allocation, options.nowSeconds, grace))
    // Oldest expiry first, so the longest-stranded money moves first.
    .sort((left, right) => (left.expiry < right.expiry ? -1 : left.expiry > right.expiry ? 1 : 0));

  const batches: string[][] = [];
  for (let index = 0; index < due.length; index += size) {
    batches.push(due.slice(index, index + size).map((allocation) => allocation.commitmentHash));
  }
  return batches;
}

/** Totals by state, for the status line the operator actually reads. */
export function summarize(allocations: Iterable<TrackedAllocation>): {
  funded: number;
  claimed: number;
  refunded: number;
  outstanding: bigint;
} {
  let funded = 0;
  let claimed = 0;
  let refunded = 0;
  let outstanding = 0n;

  for (const allocation of allocations) {
    if (allocation.state === "funded") {
      funded += 1;
      outstanding += allocation.amount;
    } else if (allocation.state === "claimed") claimed += 1;
    else refunded += 1;
  }
  return { funded, claimed, refunded, outstanding };
}
