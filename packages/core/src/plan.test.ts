import { describe, expect, it } from "vitest";

import { planBatch, type Payout } from "./plan.js";

const TOKEN = "0xaaa";
const OTHER_TOKEN = "0xbbb";
const REFUND = "0xfee";

let counter = 0;
const deterministicSecret = () => `0x${(++counter).toString(16)}`;

function options(overrides: Partial<Parameters<typeof planBatch>[1]> = {}) {
  counter = 0;
  return { refundRecipient: REFUND, makeSecret: deterministicSecret, ...overrides };
}

const payout = (over: Partial<Payout> = {}): Payout => ({
  recipient: "0x1",
  token: TOKEN,
  amount: 100n,
  registered: false,
  ...over,
});

describe("planBatch", () => {
  it("routes registered recipients direct and the rest through escrow", () => {
    const plan = planBatch(
      [
        payout({ recipient: "0x1", registered: true, amount: 10n }),
        payout({ recipient: "0x2", registered: false, amount: 20n }),
      ],
      options(),
    );

    expect(plan.direct).toHaveLength(1);
    expect(plan.direct[0]?.amount).toBe(10n);
    expect(plan.escrowed).toHaveLength(1);
    expect(plan.escrowed[0]?.amount).toBe(20n);
  });

  it("totals only the escrowed share into escrowTotals", () => {
    const plan = planBatch(
      [
        payout({ registered: true, amount: 10n }),
        payout({ registered: false, amount: 20n }),
        payout({ registered: false, amount: 5n, token: OTHER_TOKEN }),
      ],
      options(),
    );

    expect(plan.totals.get("0xaaa")).toBe(30n);
    expect(plan.escrowTotals.get("0xaaa")).toBe(20n);
    expect(plan.escrowTotals.get("0xbbb")).toBe(5n);
  });

  it("gives every escrowed payout its own secret and commitment", () => {
    const plan = planBatch([payout(), payout({ recipient: "0x2" })], options());
    const [first, second] = plan.escrowed;
    expect(first?.secret).not.toBe(second?.secret);
    expect(first?.commitmentHash).not.toBe(second?.commitmentHash);
  });

  it("carries expiry and refund recipient onto each allocation", () => {
    const plan = planBatch([payout()], options({ expiry: 1_700_000_000n }));
    expect(plan.escrowed[0]?.expiry).toBe(1_700_000_000n);
    expect(plan.escrowed[0]?.refundRecipient).toBe("0xfee");
  });

  it("defaults to never expiring", () => {
    const plan = planBatch([payout()], options());
    expect(plan.escrowed[0]?.expiry).toBe(0n);
  });

  it("normalizes addresses so padding does not create duplicate token buckets", () => {
    const plan = planBatch(
      [payout({ token: "0x0aaa", amount: 1n }), payout({ token: "0xaaa", amount: 2n })],
      options(),
    );
    expect(plan.escrowTotals.size).toBe(1);
    expect(plan.escrowTotals.get("0xaaa")).toBe(3n);
  });

  it("rejects an empty batch", () => {
    expect(() => planBatch([], options())).toThrow(/empty batch/);
  });

  it("rejects a non-positive or oversized amount", () => {
    expect(() => planBatch([payout({ amount: 0n })], options())).toThrow(/must be positive/);
    expect(() => planBatch([payout({ amount: -1n })], options())).toThrow(/must be positive/);
    expect(() => planBatch([payout({ amount: 2n ** 128n })], options())).toThrow(/u128/);
  });

  it("rejects zero addresses", () => {
    expect(() => planBatch([payout({ token: "0x0" })], options())).toThrow(/token/);
    expect(() => planBatch([payout({ recipient: "0x0" })], options())).toThrow(/recipient/);
    expect(() => planBatch([payout()], options({ refundRecipient: "0x0" }))).toThrow(/refund/);
  });

  it("rejects an expiry that overflows u64", () => {
    expect(() => planBatch([payout()], options({ expiry: 2n ** 64n }))).toThrow(/u64/);
  });

  it("catches a duplicate commitment before it reverts on-chain", () => {
    // A batch is atomic, so a duplicate would revert the whole run after signing.
    const constant = () => "0x7";
    expect(() =>
      planBatch([payout(), payout({ recipient: "0x2" })], {
        refundRecipient: REFUND,
        makeSecret: constant,
      }),
    ).toThrow(/duplicate commitment/);
  });
});
