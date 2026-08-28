import type { STRK20_ACTION } from "@starknet-io/types-js";

import { normalizeFelt } from "./commitments.js";
import { ESCROW_OPERATION } from "./constants.js";
import { enumVariant, felt, openNoteIdPlaceholder, span, type CalldataItem } from "./serde.js";
import type { BatchPlan } from "./plan.js";

/**
 * Pool action phases, in the order `apply_actions` enforces.
 *
 * A transaction may skip a phase but never go backwards, so actions are emitted
 * in this order: private transfers create notes (phase 5), the escrow is funded
 * by a withdrawal (phase 6), and the helper call comes last (phase 7).
 */
const PHASE = { transfer: 5, withdraw: 6, invoke: 7 } as const;

export interface FundOptions {
  /** Deployed Almoner escrow. Only required when the plan has escrowed payouts. */
  readonly escrowAddress?: string;
}

/**
 * Builds the actions that fund a whole batch in **one** pool transaction.
 *
 * One transaction means one flat pool fee no matter how many recipients, which
 * is the entire economic argument for batching. It also means one signature: the
 * payer approves the run, not each payment.
 *
 * The pool allows at most one external invoke per transaction, so every escrowed
 * allocation travels in a single `privacy_invoke` call.
 */
export function buildFundActions(plan: BatchPlan, options: FundOptions): STRK20_ACTION[] {
  if (plan.direct.length === 0 && plan.escrowed.length === 0) {
    throw new Error("plan contains no payouts");
  }

  // The escrow is only involved when someone is being paid by claim link. A
  // batch where every recipient already uses the pool is pure note-to-note
  // transfers, and demanding an escrow address for it blocks a perfectly valid
  // payment on a contract it never touches.
  const escrowAddress = plan.escrowed.length > 0 ? normalizeFelt(options.escrowAddress ?? "0x0") : "0x0";
  if (plan.escrowed.length > 0 && BigInt(escrowAddress) === 0n) {
    throw new Error(
      `${plan.escrowed.length} recipient(s) are not registered with the pool and must be paid ` +
        "through the escrow contract, but no escrow address is configured for this network.",
    );
  }

  const actions: STRK20_ACTION[] = [];

  // Phase 5 - private note to each already-registered recipient.
  for (const transfer of plan.direct) {
    actions.push({
      type: "transfer",
      token: transfer.token,
      amount: felt(transfer.amount),
      recipient: transfer.recipient,
    });
  }

  if (plan.escrowed.length === 0) return actions;

  // Phase 6 - move the escrow's share out of the pool, one withdrawal per token.
  for (const [token, total] of plan.escrowTotals) {
    actions.push({
      type: "withdraw",
      token,
      amount: felt(total),
      recipient: escrowAddress,
    });
  }

  // Phase 7 - hand the escrow every allocation at once.
  const allocations = plan.escrowed.map((allocation) => [
    felt(allocation.commitmentHash),
    felt(allocation.token),
    felt(allocation.amount),
    felt(allocation.expiry),
    felt(allocation.refundRecipient),
  ]);

  actions.push({
    type: "invoke",
    contract: escrowAddress,
    calldata: [
      enumVariant(ESCROW_OPERATION.Deposit),
      ...span(allocations),
      ...span([]), // claims: unused on this branch
    ],
  });

  return actions;
}

export interface ClaimRequestInput {
  /** The secret from the claim link. */
  readonly secret: string;
  /** Token the allocation is denominated in. */
  readonly token: string;
}

export interface ClaimOptions {
  readonly escrowAddress: string;
  /** Account the redeemed notes are credited to — the claimer's own address. */
  readonly recipient: string;
}

/**
 * Builds the actions that redeem one or more claims into private notes.
 *
 * Each claim needs an open note to be credited into. An open note's amount is
 * filled in on-chain after proving, which is exactly what a claim needs: the
 * escrow decides the amount, not the claimer.
 *
 * `${openNoteIds[N]}` refers to the Nth **open** transfer in this transaction,
 * so the notes are emitted in the same order as the claims.
 */
export function buildClaimActions(
  claims: readonly ClaimRequestInput[],
  options: ClaimOptions,
): STRK20_ACTION[] {
  if (claims.length === 0) throw new Error("cannot build a claim with no requests");

  const escrowAddress = normalizeFelt(options.escrowAddress);
  const recipient = normalizeFelt(options.recipient);
  if (BigInt(escrowAddress) === 0n) throw new Error("escrowAddress must not be zero");
  if (BigInt(recipient) === 0n) throw new Error("recipient must not be zero");

  const actions: STRK20_ACTION[] = claims.map((claim) => ({
    type: "transfer",
    token: normalizeFelt(claim.token),
    amount: "OPEN",
    recipient,
  }));

  const claimItems: CalldataItem[][] = claims.map((claim, index) => [
    felt(claim.secret),
    openNoteIdPlaceholder(index),
  ]);

  actions.push({
    type: "invoke",
    contract: escrowAddress,
    calldata: [
      enumVariant(ESCROW_OPERATION.Claim),
      ...span([]), // allocations: unused on this branch
      ...span(claimItems),
    ],
  });

  return actions;
}

/**
 * Asserts the emitted actions never move backwards through the pool's phases.
 *
 * The pool rejects out-of-order actions, and that failure surfaces only after
 * the user has signed, so it is worth catching while building.
 */
export function assertPhaseOrder(actions: readonly STRK20_ACTION[]): void {
  let lowest = 0;
  actions.forEach((action, index) => {
    if (action.type === "deposit") return;
    const phase = PHASE[action.type];
    if (phase < lowest) {
      throw new Error(
        `action ${index} (${action.type}, phase ${phase}) goes backwards from phase ${lowest}`,
      );
    }
    lowest = phase;
  });
}
