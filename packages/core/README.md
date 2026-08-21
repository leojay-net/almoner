# @almoner/core

Plan and encode STRK20 batch disbursements: commitments, claim secrets, and the
wallet actions that fund and redeem them.

## Why batching

The pool charges a **flat fee per `apply_actions` call**, not per payment —
`collect_fee()` runs once at the top of the call, and one call carries any number
of transfers. Verified against the deployed mainnet pool; the published docs say
"per private operation", which reads the opposite way.

| Payout | Total fee | Per recipient |
| --- | --- | --- |
| 1 recipient | 6 STRK | 6 STRK |
| 50 recipients, batched | **6 STRK** | **0.12 STRK** |
| 50 recipients, separately | 300 STRK | 6 STRK |

Cross-payer batching is impossible — the pool extracts exactly one
`(user_addr, user_private_key)` per transaction — so this only works in the
paying-many direction.

## The two routes

You cannot privately transfer to someone who has not registered a viewing key,
and only they can register. So `planBatch` splits recipients:

- **registered** → a direct private transfer inside the pool
- **everyone else** → parked in the escrow behind `poseidon(TAG, secret)`, claimed
  later with the secret

```ts
import { planBatch, buildFundActions } from "@almoner/core";

const plan = planBatch(
  [
    { recipient: "0x1", token: STRK, amount: 100n, registered: true },
    { recipient: "0x2", token: STRK, amount: 250n, registered: false },
  ],
  { refundRecipient: treasury, expiry: 1_700_000_000n },
);

const actions = buildFundActions(plan, { escrowAddress });
await account.strk20InvokeTransaction(actions); // one signature, one fee
```

`plan.escrowed[i].secret` is the bearer token for each claim link. It never goes
on-chain — only its hash does.

Claiming:

```ts
import { buildClaimActions } from "@almoner/core";

const actions = buildClaimActions([{ secret, token }], {
  escrowAddress,
  recipient: claimerAddress,
});
```

## Details that bite

**Phase order.** The pool assigns each action a phase and forbids going
backwards: transfers create notes (5), withdrawals leave the pool (6), the
external invoke runs last (7). Actions are emitted in that order, and
`assertPhaseOrder` will tell you if a hand-built list violates it. The pool
rejects a bad order *after* the user has signed.

**One invoke per transaction.** Protocol-enforced, so every allocation in a batch
travels in a single `privacy_invoke`.

**Open notes for claims.** Each claim opens a note via a `"OPEN"` transfer, and
the calldata references it as `${openNoteIds[N]}` — the Nth open transfer in the
same transaction. An open note's amount is filled in on-chain after proving,
which is exactly right for a claim: the escrow decides the amount, not the
claimer.

**Address padding.** `0x01` and `0x1` are the same address; wallets and RPCs
disagree on padding. Everything is normalized, and `feltEquals` compares numerically.

**Pool fee is not sponsored.** Wallet flows sponsor gas but not the pool fee.
Reserve `POOL_FEE_FRI` when pre-filling a MAX amount, or the transaction fails
after signing.

## Commitment parity

`computeCommitmentHash` must stay byte-identical to `compute_commitment_hash` in
the Cairo escrow. The same vector is asserted in **both** test suites:

```
poseidon('ALMONER_COMMITMENT:V1', 'secret-one')
  = 0x1c43a7fcd994cb13b1375f6d4bc28e03bb50f244905f9e1410664958a93712f
```

If those drift, every issued claim link becomes unredeemable — the payer commits
to one hash and the recipient proves a preimage of another.

## Secrets

`generateSecret` uses the platform CSPRNG and reduces into the felt field. A
secret is a bearer token: whoever holds it can claim. Never log it, never store
it server-side, and keep it out of URL paths that land in access logs — a
fragment or an encrypted store is the right home.

## License

MIT
