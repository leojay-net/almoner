import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Chain } from "./chain.ts";
import type { KeeperConfig } from "./config.ts";
import { EVENT_SELECTOR, type RawEvent } from "./events.ts";
import { emptyState, loadState, type KeeperState } from "./store.ts";
import { runPass } from "./sweeper.ts";

const STATUS = { none: 0, funded: 1, claimed: 2, refunded: 3 } as const;

let directory: string;
const log = { info: vi.fn(), warn: vi.fn() };

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "almoner-keeper-"));
  log.info.mockReset();
  log.warn.mockReset();
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function config(over: Partial<KeeperConfig> = {}): KeeperConfig {
  return {
    rpcUrl: "http://localhost",
    escrowAddress: "0xe5c",
    accountAddress: "0xacc",
    privateKey: "0xkey",
    fromBlock: 0,
    statePath: join(directory, "state.json"),
    intervalMs: 1000,
    graceSeconds: 0n,
    batchSize: 25,
    dryRun: false,
    ...over,
  };
}

const fundedEvent = (commitment: string, expiry: string): RawEvent => ({
  keys: [EVENT_SELECTOR.funded, commitment, "0xaaa"],
  data: ["0x64", expiry, "0xfee"],
  block_number: 5,
});

interface FakeOptions {
  events?: RawEvent[];
  statuses?: Record<string, number>;
  timestamp?: bigint;
  refundFails?: boolean;
}

function fakeChain(options: FakeOptions = {}) {
  const refundBatch = vi.fn(async (hashes: readonly string[]) => {
    if (options.refundFails) throw new Error("reverted: NOT_YET_EXPIRED");
    return `0xtx${hashes.length}`;
  });
  const chain: Chain = {
    provider: {} as Chain["provider"],
    blockNumber: async () => 100,
    blockTimestamp: async () => options.timestamp ?? 10_000n,
    fetchEvents: async () => options.events ?? [],
    allocationStatus: async (hash) => options.statuses?.[hash] ?? STATUS.funded,
    refundBatch,
  };
  return { chain, refundBatch };
}

describe("runPass", () => {
  it("refunds an expired allocation and records it", async () => {
    const { chain, refundBatch } = fakeChain({ events: [fundedEvent("0x1", "0x3e8")] });
    const state = emptyState(0);

    const result = await runPass(chain, state, config(), log);

    expect(refundBatch).toHaveBeenCalledWith(["0x1"]);
    expect(result.swept).toEqual(["0x1"]);
    expect(state.allocations.get("0x1")?.state).toBe("refunded");
  });

  it("leaves an allocation alone until it expires", async () => {
    const { chain, refundBatch } = fakeChain({
      events: [fundedEvent("0x1", "0x3e8")],
      timestamp: 999n,
    });
    const result = await runPass(chain, emptyState(0), config(), log);

    expect(refundBatch).not.toHaveBeenCalled();
    expect(result.swept).toEqual([]);
  });

  it("checks on-chain status before spending gas", async () => {
    // Local state can be stale - the recipient may have claimed since the last
    // scan. refund_batch reverts wholesale, so the whole chunk would be wasted.
    const { chain, refundBatch } = fakeChain({
      events: [fundedEvent("0x1", "0x3e8")],
      statuses: { "0x1": STATUS.claimed },
    });
    const state = emptyState(0);

    const result = await runPass(chain, state, config(), log);

    expect(refundBatch).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(state.allocations.get("0x1")?.state).toBe("claimed");
  });

  it("survives a reverted batch instead of aborting the sweep", async () => {
    const { chain } = fakeChain({
      events: [fundedEvent("0x1", "0x3e8")],
      refundFails: true,
    });
    const state = emptyState(0);

    const result = await runPass(chain, state, config(), log);

    expect(result.swept).toEqual([]);
    expect(result.skipped).toBe(1);
    // Still funded locally, so the next pass retries it.
    expect(state.allocations.get("0x1")?.state).toBe("funded");
    expect(log.warn).toHaveBeenCalled();
  });

  it("submits nothing in dry-run mode", async () => {
    const { chain, refundBatch } = fakeChain({ events: [fundedEvent("0x1", "0x3e8")] });
    const result = await runPass(chain, emptyState(0), config({ dryRun: true }), log);

    expect(refundBatch).not.toHaveBeenCalled();
    expect(result.swept).toEqual([]);
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining("[dry run]"));
  });

  it("honours the grace period", async () => {
    const { chain, refundBatch } = fakeChain({
      events: [fundedEvent("0x1", "0x3e8")],
      timestamp: 1000n,
    });
    await runPass(chain, emptyState(0), config({ graceSeconds: 120n }), log);
    expect(refundBatch).not.toHaveBeenCalled();

    const later = fakeChain({ events: [fundedEvent("0x1", "0x3e8")], timestamp: 1120n });
    await runPass(later.chain, emptyState(0), config({ graceSeconds: 120n }), log);
    expect(later.refundBatch).toHaveBeenCalled();
  });

  it("persists state so a restart resumes instead of rescanning", async () => {
    const settings = config();
    const { chain } = fakeChain({ events: [fundedEvent("0x1", "0x0")] });
    const state: KeeperState = emptyState(0);

    await runPass(chain, state, settings, log);

    const reloaded = await loadState(settings.statePath, 0);
    expect(reloaded.cursorBlock).toBe(100);
    expect(reloaded.allocations.get("0x1")?.amount).toBe(100n);
    // BigInts must survive the JSON round trip.
    expect(typeof reloaded.allocations.get("0x1")?.expiry).toBe("bigint");
  });

  it("writes state atomically, leaving no partial file behind", async () => {
    const settings = config();
    const { chain } = fakeChain({ events: [fundedEvent("0x1", "0x0")] });
    await runPass(chain, emptyState(0), settings, log);

    const raw = await readFile(settings.statePath, "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
