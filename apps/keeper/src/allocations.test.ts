import { describe, expect, it } from "vitest";

import {
  DEFAULT_GRACE_SECONDS,
  isSweepable,
  selectSweepBatches,
  summarize,
  type TrackedAllocation,
} from "./allocations.ts";

const allocation = (over: Partial<TrackedAllocation> = {}): TrackedAllocation => ({
  commitmentHash: "0x1",
  token: "0xaaa",
  amount: 100n,
  expiry: 1000n,
  refundRecipient: "0xfee",
  state: "funded",
  fundedAtBlock: 1,
  ...over,
});

describe("isSweepable", () => {
  it("waits for the grace period past expiry", () => {
    // Block timestamps drift from wall clock; refunding a moment early reverts
    // and wastes gas.
    const a = allocation();
    expect(isSweepable(a, 999n)).toBe(false);
    expect(isSweepable(a, 1000n)).toBe(false);
    expect(isSweepable(a, 1000n + DEFAULT_GRACE_SECONDS - 1n)).toBe(false);
    expect(isSweepable(a, 1000n + DEFAULT_GRACE_SECONDS)).toBe(true);
  });

  it("never sweeps an allocation with no expiry", () => {
    expect(isSweepable(allocation({ expiry: 0n }), 10n ** 12n)).toBe(false);
  });

  it("never sweeps one already settled", () => {
    expect(isSweepable(allocation({ state: "claimed" }), 10n ** 12n)).toBe(false);
    expect(isSweepable(allocation({ state: "refunded" }), 10n ** 12n)).toBe(false);
  });
});

describe("selectSweepBatches", () => {
  const due = [
    allocation({ commitmentHash: "0x1", expiry: 300n }),
    allocation({ commitmentHash: "0x2", expiry: 100n }),
    allocation({ commitmentHash: "0x3", expiry: 200n }),
  ];

  it("orders oldest expiry first", () => {
    const [batch] = selectSweepBatches(due, { nowSeconds: 10_000n });
    expect(batch).toEqual(["0x2", "0x3", "0x1"]);
  });

  it("chunks to the batch size", () => {
    // refund_batch reverts wholesale, so a surprise costs a chunk, not the sweep.
    expect(selectSweepBatches(due, { nowSeconds: 10_000n, batchSize: 2 })).toEqual([
      ["0x2", "0x3"],
      ["0x1"],
    ]);
  });

  it("excludes anything not yet due", () => {
    expect(selectSweepBatches(due, { nowSeconds: 0n })).toEqual([]);
  });

  it("rejects a nonsensical batch size", () => {
    expect(() => selectSweepBatches(due, { nowSeconds: 1n, batchSize: 0 })).toThrow();
  });
});

describe("summarize", () => {
  it("counts states and totals only outstanding funds", () => {
    const result = summarize([
      allocation({ commitmentHash: "0x1", amount: 10n }),
      allocation({ commitmentHash: "0x2", amount: 20n, state: "claimed" }),
      allocation({ commitmentHash: "0x3", amount: 30n, state: "refunded" }),
    ]);
    expect(result).toEqual({ funded: 1, claimed: 1, refunded: 1, outstanding: 10n });
  });
});
