import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { AllocationState, TrackedAllocation } from "./allocations.ts";

/**
 * Durable keeper state.
 *
 * Written atomically — a temp file plus rename — so a crash mid-write leaves the
 * previous good state rather than a truncated file. The keeper rebuilds from
 * chain events anyway, but a corrupt cursor would make it rescan from the
 * beginning on every restart.
 */
export interface KeeperState {
  /** Last block scanned, inclusive. Scanning resumes at the next block. */
  cursorBlock: number;
  allocations: Map<string, TrackedAllocation>;
}

interface SerializedAllocation {
  commitmentHash: string;
  token: string;
  amount: string;
  expiry: string;
  refundRecipient: string;
  state: AllocationState;
  fundedAtBlock: number;
}

interface SerializedState {
  version: 1;
  cursorBlock: number;
  allocations: SerializedAllocation[];
}

export function emptyState(fromBlock: number): KeeperState {
  return { cursorBlock: fromBlock - 1, allocations: new Map() };
}

export async function loadState(path: string, fromBlock: number): Promise<KeeperState> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return emptyState(fromBlock);
  }

  try {
    const parsed = JSON.parse(raw) as SerializedState;
    if (parsed.version !== 1) return emptyState(fromBlock);

    const allocations = new Map<string, TrackedAllocation>();
    for (const entry of parsed.allocations) {
      allocations.set(entry.commitmentHash, {
        commitmentHash: entry.commitmentHash,
        token: entry.token,
        amount: BigInt(entry.amount),
        expiry: BigInt(entry.expiry),
        refundRecipient: entry.refundRecipient,
        state: entry.state,
        fundedAtBlock: entry.fundedAtBlock,
      });
    }
    return { cursorBlock: parsed.cursorBlock, allocations };
  } catch {
    // A damaged file should not wedge the keeper; rebuilding from chain is safe.
    return emptyState(fromBlock);
  }
}

export async function saveState(path: string, state: KeeperState): Promise<void> {
  const payload: SerializedState = {
    version: 1,
    cursorBlock: state.cursorBlock,
    allocations: [...state.allocations.values()].map((allocation) => ({
      commitmentHash: allocation.commitmentHash,
      token: allocation.token,
      amount: allocation.amount.toString(),
      expiry: allocation.expiry.toString(),
      refundRecipient: allocation.refundRecipient,
      state: allocation.state,
      fundedAtBlock: allocation.fundedAtBlock,
    })),
  };

  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, JSON.stringify(payload, null, 2), "utf8");
  await rename(temporary, path);
}
