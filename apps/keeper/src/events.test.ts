import { describe, expect, it } from "vitest";

import { EVENT_SELECTOR, applyEvents, decodeEvent, type RawEvent } from "./events.ts";
import type { TrackedAllocation } from "./allocations.ts";

const fundedEvent = (commitment = "0x1"): RawEvent => ({
  keys: [EVENT_SELECTOR.funded, commitment, "0xaaa"],
  data: ["0x64", "0x3e8", "0xfee"], // amount 100, expiry 1000, refund 0xfee
  block_number: 7,
});

describe("decodeEvent", () => {
  it("decodes a funding event from the ABI layout", () => {
    const decoded = decodeEvent(fundedEvent());
    expect(decoded).toEqual({
      kind: "funded",
      allocation: {
        commitmentHash: "0x1",
        token: "0xaaa",
        amount: 100n,
        expiry: 1000n,
        refundRecipient: "0xfee",
        state: "funded",
        fundedAtBlock: 7,
      },
    });
  });

  it("decodes claims and refunds", () => {
    expect(
      decodeEvent({ keys: [EVENT_SELECTOR.claimed, "0x1", "0xaaa"], data: ["0x64", "0x9"] }),
    ).toMatchObject({ kind: "claimed", commitmentHash: "0x1" });
    expect(
      decodeEvent({ keys: [EVENT_SELECTOR.refunded, "0x1", "0xaaa"], data: ["0x64", "0xfee"] }),
    ).toMatchObject({ kind: "refunded", commitmentHash: "0x1" });
  });

  it("ignores unknown events rather than throwing", () => {
    // A contract upgrade adding an event must not halt the keeper.
    expect(decodeEvent({ keys: ["0xdead", "0x1"], data: [] })).toBeNull();
    expect(decodeEvent({ keys: [], data: [] })).toBeNull();
  });

  it("returns null on a truncated payload", () => {
    expect(decodeEvent({ keys: [EVENT_SELECTOR.funded, "0x1", "0xaaa"], data: ["0x64"] })).toBeNull();
  });

  it("matches selectors regardless of hex padding", () => {
    const padded = EVENT_SELECTOR.funded.replace("0x", "0x0");
    expect(decodeEvent({ ...fundedEvent(), keys: [padded, "0x1", "0xaaa"] })).not.toBeNull();
  });
});

describe("applyEvents", () => {
  it("tracks a funded allocation", () => {
    const allocations = new Map<string, TrackedAllocation>();
    expect(applyEvents(allocations, [fundedEvent()])).toEqual({ applied: 1, skipped: 0 });
    expect(allocations.get("0x1")?.state).toBe("funded");
  });

  it("moves an allocation to claimed", () => {
    const allocations = new Map<string, TrackedAllocation>();
    applyEvents(allocations, [
      fundedEvent(),
      { keys: [EVENT_SELECTOR.claimed, "0x1", "0xaaa"], data: ["0x64", "0x9"] },
    ]);
    expect(allocations.get("0x1")?.state).toBe("claimed");
  });

  it("will not resurrect a settled allocation on a re-scan", () => {
    // The reorg buffer replays recent blocks every pass. Without this guard a
    // replayed funding event would reset a claimed allocation and the keeper
    // would try to refund money that has already moved.
    const allocations = new Map<string, TrackedAllocation>();
    applyEvents(allocations, [
      fundedEvent(),
      { keys: [EVENT_SELECTOR.claimed, "0x1", "0xaaa"], data: ["0x64", "0x9"] },
    ]);
    const result = applyEvents(allocations, [fundedEvent()]);
    expect(allocations.get("0x1")?.state).toBe("claimed");
    expect(result.skipped).toBe(1);
  });

  it("skips a settlement for an allocation it never saw funded", () => {
    const allocations = new Map<string, TrackedAllocation>();
    const result = applyEvents(allocations, [
      { keys: [EVENT_SELECTOR.claimed, "0xbeef", "0xaaa"], data: ["0x64", "0x9"] },
    ]);
    expect(result).toEqual({ applied: 0, skipped: 1 });
    expect(allocations.size).toBe(0);
  });
});
