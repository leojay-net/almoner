import { computeCommitmentHash, generateSecret, normalizeFelt } from "./commitments.js";
import { NO_EXPIRY } from "./constants.js";

/** One person to pay, as the caller supplies them. */
export interface Payout {
  /**
   * Starknet address. For a registered recipient this receives the private note
   * directly; for an unregistered one it is informational, since the claim is
   * bearer-based and redeemed into whatever account presents the secret.
   */
  readonly recipient: string;
  readonly token: string;
  /** In the token's smallest unit. */
  readonly amount: bigint;
  /**
   * Whether the recipient has already registered a viewing key with the pool.
   * Registered recipients are paid by direct private transfer; the rest are
   * escrowed behind a claim secret, because only they can register themselves.
   */
  readonly registered: boolean;
}

/** A payout routed as a direct in-pool transfer. */
export interface DirectTransfer {
  readonly recipient: string;
  readonly token: string;
  readonly amount: bigint;
}

/** A payout parked in the escrow behind a commitment. */
export interface EscrowedAllocation {
  readonly recipient: string;
  readonly token: string;
  readonly amount: bigint;
  /** Bearer token. Goes to the recipient out of band and is never published. */
  readonly secret: string;
  readonly commitmentHash: string;
  /** Unix seconds; `0` never expires. */
  readonly expiry: bigint;
  readonly refundRecipient: string;
}

export interface BatchPlan {
  readonly direct: readonly DirectTransfer[];
  readonly escrowed: readonly EscrowedAllocation[];
  /** Total to withdraw to the escrow, per token. */
  readonly escrowTotals: ReadonlyMap<string, bigint>;
  /** Everything leaving the payer's shielded balance, per token. */
  readonly totals: ReadonlyMap<string, bigint>;
}

export interface PlanOptions {
  /**
   * Where expired allocations are refunded. Public on refund, so prefer a fresh
   * address if the link matters.
   */
  readonly refundRecipient: string;
  /** Unix seconds. `0` (the default) means allocations never expire. */
  readonly expiry?: bigint;
  /** Injectable for deterministic tests. Defaults to the platform CSPRNG. */
  readonly makeSecret?: () => string;
}

const MAX_U128 = 2n ** 128n - 1n;
const MAX_U64 = 2n ** 64n - 1n;

/**
 * Splits payouts into the two routes and generates a claim secret for each
 * escrowed one.
 *
 * Validates eagerly: a batch is one atomic transaction, so a single bad entry
 * reverts the whole run after the payer has already signed.
 */
export function planBatch(payouts: readonly Payout[], options: PlanOptions): BatchPlan {
  if (payouts.length === 0) throw new Error("cannot plan an empty batch");

  const expiry = options.expiry ?? NO_EXPIRY;
  if (expiry < 0n || expiry > MAX_U64) {
    throw new RangeError(`expiry must fit in u64, got ${expiry}`);
  }
  if (BigInt(options.refundRecipient) === 0n) {
    throw new Error("refundRecipient must not be the zero address");
  }

  const makeSecret = options.makeSecret ?? generateSecret;
  const refundRecipient = normalizeFelt(options.refundRecipient);

  const direct: DirectTransfer[] = [];
  const escrowed: EscrowedAllocation[] = [];
  const escrowTotals = new Map<string, bigint>();
  const totals = new Map<string, bigint>();
  const seenCommitments = new Set<string>();

  payouts.forEach((payout, index) => {
    if (payout.amount <= 0n) {
      throw new RangeError(`payout ${index}: amount must be positive, got ${payout.amount}`);
    }
    if (payout.amount > MAX_U128) {
      throw new RangeError(`payout ${index}: amount must fit in u128`);
    }
    if (BigInt(payout.token) === 0n) throw new Error(`payout ${index}: token must not be zero`);
    if (BigInt(payout.recipient) === 0n) {
      throw new Error(`payout ${index}: recipient must not be zero`);
    }

    const token = normalizeFelt(payout.token);
    const recipient = normalizeFelt(payout.recipient);
    totals.set(token, (totals.get(token) ?? 0n) + payout.amount);

    if (payout.registered) {
      direct.push({ recipient, token, amount: payout.amount });
      return;
    }

    const secret = makeSecret();
    const commitmentHash = computeCommitmentHash(secret);
    // The escrow rejects a commitment that already exists, which would revert
    // the batch on-chain. Catch it here instead.
    if (seenCommitments.has(commitmentHash)) {
      throw new Error(`payout ${index}: duplicate commitment hash in batch`);
    }
    seenCommitments.add(commitmentHash);

    escrowed.push({
      recipient,
      token,
      amount: payout.amount,
      secret,
      commitmentHash,
      expiry,
      refundRecipient,
    });
    escrowTotals.set(token, (escrowTotals.get(token) ?? 0n) + payout.amount);
  });

  return { direct, escrowed, escrowTotals, totals };
}
