import { describe, expect, it } from "vitest";

import { assertPhaseOrder, buildClaimActions, buildFundActions } from "./actions.js";
import { planBatch, type Payout } from "./plan.js";

const TOKEN = "0xaaa";
const OTHER_TOKEN = "0xbbb";
const ESCROW = "0xe5c";
const REFUND = "0xfee";

let counter = 0;
const deterministicSecret = () => `0x${(++counter).toString(16)}`;

const payout = (over: Partial<Payout> = {}): Payout => ({
  recipient: "0x1",
  token: TOKEN,
  amount: 100n,
  registered: false,
  ...over,
});

function plan(payouts: Payout[], expiry = 0n) {
  counter = 0;
  return planBatch(payouts, {
    refundRecipient: REFUND,
    expiry,
    makeSecret: deterministicSecret,
  });
}

describe("buildFundActions", () => {
  it("emits transfers, then withdrawals, then a single invoke", () => {
    // The pool enforces phase order: notes (5) before withdrawals (6) before the
    // external invoke (7). Going backwards is rejected after the user has signed.
    const actions = buildFundActions(
      plan([payout({ registered: true }), payout({ recipient: "0x2", registered: false })]),
      { escrowAddress: ESCROW },
    );

    expect(actions.map((a) => a.type)).toEqual(["transfer", "withdraw", "invoke"]);
    expect(() => assertPhaseOrder(actions)).not.toThrow();
  });

  it("uses exactly one invoke however many recipients are escrowed", () => {
    // The pool permits at most one external invoke per transaction.
    const actions = buildFundActions(
      plan([
        payout({ recipient: "0x1" }),
        payout({ recipient: "0x2" }),
        payout({ recipient: "0x3" }),
      ]),
      { escrowAddress: ESCROW },
    );

    expect(actions.filter((a) => a.type === "invoke")).toHaveLength(1);
  });

  it("withdraws the escrow total once per token", () => {
    const actions = buildFundActions(
      plan([
        payout({ recipient: "0x1", amount: 100n }),
        payout({ recipient: "0x2", amount: 50n }),
        payout({ recipient: "0x3", amount: 7n, token: OTHER_TOKEN }),
      ]),
      { escrowAddress: ESCROW },
    );

    const withdrawals = actions.filter((a) => a.type === "withdraw");
    expect(withdrawals).toHaveLength(2);
    expect(withdrawals.every((w) => "recipient" in w && w.recipient === ESCROW)).toBe(true);
    const byToken = Object.fromEntries(
      withdrawals.map((w) => ["token" in w ? w.token : "", "amount" in w ? w.amount : ""]),
    );
    expect(byToken[TOKEN]).toBe("0x96"); // 150
    expect(byToken[OTHER_TOKEN]).toBe("0x7");
  });

  it("encodes Deposit calldata in the Cairo parameter order", () => {
    const batch = plan([payout({ recipient: "0x1", amount: 100n })], 1_700_000_000n);
    const actions = buildFundActions(batch, { escrowAddress: ESCROW });
    const invoke = actions.find((a) => a.type === "invoke");

    // privacy_invoke(operation, allocations: Span<Allocation>, claims: Span<ClaimRequest>)
    // Allocation = { commitment_hash, token, amount, expiry, refund_recipient }
    const allocation = batch.escrowed[0]!;
    expect(invoke && "calldata" in invoke && invoke.calldata).toEqual([
      "0x0", // EscrowOperation::Deposit
      "0x1", // allocations.len()
      allocation.commitmentHash,
      TOKEN,
      "0x64", // 100
      "0x6553f100", // expiry
      REFUND,
      "0x0", // claims.len()
    ]);
  });

  it("skips the escrow entirely when every recipient is registered", () => {
    const actions = buildFundActions(plan([payout({ registered: true })]), {
      escrowAddress: ESCROW,
    });
    expect(actions.map((a) => a.type)).toEqual(["transfer"]);
  });

  it("rejects a zero escrow address", () => {
    expect(() => buildFundActions(plan([payout()]), { escrowAddress: "0x0" })).toThrow(/zero/);
  });
});

describe("buildClaimActions", () => {
  it("opens one note per claim and references them positionally", () => {
    const actions = buildClaimActions(
      [
        { secret: "0x11", token: TOKEN },
        { secret: "0x22", token: OTHER_TOKEN },
      ],
      { escrowAddress: ESCROW, recipient: "0xc1a1" },
    );

    expect(actions.map((a) => a.type)).toEqual(["transfer", "transfer", "invoke"]);
    // An open note's amount is filled in on-chain after proving, which is what a
    // claim needs: the escrow decides the amount, not the claimer.
    expect(actions.slice(0, 2).every((a) => "amount" in a && a.amount === "OPEN")).toBe(true);

    const invoke = actions.at(-1)!;
    expect("calldata" in invoke && invoke.calldata).toEqual([
      "0x1", // EscrowOperation::Claim
      "0x0", // allocations.len()
      "0x2", // claims.len()
      "0x11",
      "${openNoteIds[0]}",
      "0x22",
      "${openNoteIds[1]}",
    ]);
  });

  it("keeps phase order", () => {
    const actions = buildClaimActions([{ secret: "0x11", token: TOKEN }], {
      escrowAddress: ESCROW,
      recipient: "0xc1a1",
    });
    expect(() => assertPhaseOrder(actions)).not.toThrow();
  });

  it("rejects empty or zero-address input", () => {
    expect(() => buildClaimActions([], { escrowAddress: ESCROW, recipient: "0x1" })).toThrow(
      /no requests/,
    );
    expect(() =>
      buildClaimActions([{ secret: "0x1", token: TOKEN }], {
        escrowAddress: ESCROW,
        recipient: "0x0",
      }),
    ).toThrow(/recipient/);
  });
});

describe("assertPhaseOrder", () => {
  it("catches an invoke placed before a withdrawal", () => {
    expect(() =>
      assertPhaseOrder([
        { type: "invoke", contract: ESCROW, calldata: [] },
        { type: "withdraw", token: TOKEN, amount: "0x1", recipient: ESCROW },
      ]),
    ).toThrow(/goes backwards/);
  });

  it("allows skipping phases", () => {
    expect(() =>
      assertPhaseOrder([{ type: "invoke", contract: ESCROW, calldata: [] }]),
    ).not.toThrow();
  });
});
