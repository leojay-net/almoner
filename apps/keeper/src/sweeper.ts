import { selectSweepBatches, summarize, type TrackedAllocation } from "./allocations.ts";
import { applyEvents } from "./events.ts";
import { saveState, type KeeperState } from "./store.ts";
import { scanFrom, type Chain } from "./chain.ts";
import type { KeeperConfig } from "./config.ts";

/** Cairo `AllocationStatus` variant index for `Funded`. */
const STATUS_FUNDED = 1;

export interface PassResult {
  readonly scannedTo: number;
  readonly eventsApplied: number;
  readonly swept: string[];
  readonly skipped: number;
  readonly summary: ReturnType<typeof summarize>;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

/**
 * One keeper pass: catch up on events, then refund whatever is due.
 *
 * Every transaction here is an ordinary public Starknet call. Nothing in this
 * path needs a ZK proof or a proving service, which is precisely why the keeper
 * can run unattended while the mainnet prover remains unavailable.
 */
export async function runPass(
  chain: Chain,
  state: KeeperState,
  config: KeeperConfig,
  log: Logger,
): Promise<PassResult> {
  const tip = await chain.blockNumber();
  const from = scanFrom(state.cursorBlock, config.fromBlock);

  let eventsApplied = 0;
  if (from <= tip) {
    const events = await chain.fetchEvents(from, tip);
    const result = applyEvents(state.allocations, events);
    eventsApplied = result.applied;
    state.cursorBlock = tip;
    if (events.length > 0) {
      log.info(`scanned ${from}-${tip}: ${result.applied} applied, ${result.skipped} skipped`);
    }
  }

  const nowSeconds = await chain.blockTimestamp();
  const batches = selectSweepBatches(state.allocations.values(), {
    nowSeconds,
    graceSeconds: config.graceSeconds,
    batchSize: config.batchSize,
  });

  const swept: string[] = [];
  let skipped = 0;

  for (const batch of batches) {
    // Confirm on-chain state before spending gas. Local state can be stale, and
    // `refund_batch` reverts wholesale if any member is no longer refundable.
    const confirmed: string[] = [];
    for (const commitmentHash of batch) {
      try {
        if ((await chain.allocationStatus(commitmentHash)) === STATUS_FUNDED) {
          confirmed.push(commitmentHash);
        } else {
          markSettled(state.allocations, commitmentHash);
          skipped += 1;
        }
      } catch (error) {
        log.warn(`could not read ${commitmentHash}: ${describe(error)}`);
        skipped += 1;
      }
    }
    if (confirmed.length === 0) continue;

    if (config.dryRun) {
      log.info(`[dry run] would refund ${confirmed.length}: ${confirmed.join(", ")}`);
      continue;
    }

    try {
      const hash = await chain.refundBatch(confirmed);
      log.info(`refunded ${confirmed.length} allocation(s) in ${hash}`);
      for (const commitmentHash of confirmed) {
        markSettled(state.allocations, commitmentHash, "refunded");
        swept.push(commitmentHash);
      }
    } catch (error) {
      // A reverted chunk is retried next pass; it must not abort the sweep.
      log.warn(`refund batch of ${confirmed.length} failed: ${describe(error)}`);
      skipped += confirmed.length;
    }
  }

  await saveState(config.statePath, state);

  return {
    scannedTo: state.cursorBlock,
    eventsApplied,
    swept,
    skipped,
    summary: summarize(state.allocations.values()),
  };
}

function markSettled(
  allocations: Map<string, TrackedAllocation>,
  commitmentHash: string,
  state: "claimed" | "refunded" = "claimed",
): void {
  const existing = allocations.get(commitmentHash);
  if (existing !== undefined) allocations.set(commitmentHash, { ...existing, state });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
