# Almoner — plan

Architecture, scope and delivery phases. For *current position* see [`STATE.md`](STATE.md).

- **Deadline:** 31 August 2026, 23:59 UTC. Winners announced 4 September.
- **Registered:** `leojay-net/almoner`, telegram `easybrane`.
- **Category:** Infra (fits Payments too; Infra is the less crowded filter).

## What we are building

A private batch disbursement rail. One payer pays many recipients from a shielded
balance, for a single flat pool fee, and can pay people who have never registered with
the STRK20 pool.

Two structural facts drive the design, both verified against the deployed contract
(see [`../CLAUDE.md`](../CLAUDE.md)):

1. **The 6 STRK pool fee is charged per transaction, not per payment.** Batching 50
   recipients into one `apply_actions` costs the same as paying one. The pool is cheap
   for disbursement and expensive for collection.
2. **You cannot pay an unregistered recipient.** Only the recipient can register their
   own viewing key, so a young pool leaves almost everyone unreachable.

Almoner exploits the first and solves the second.

## How the pieces fit

Every pool write needs a ZK proof and there is no public mainnet prover, so the system
is split at the proof boundary.

```
PAYER (wallet, proves)                    ALMONER SERVER (no proof)        RECIPIENT (wallet, proves)
  |                                              |                                  |
  | one apply_actions:                           |                                  |
  |  - notes to registered recipients            |                                  |
  |  - privacy_invoke -> escrow for the rest     |                                  |
  |--------------------------------------------->|                                  |
  |                                    schedules, tracks, notifies,                 |
  |                                    expires, refunds, reconciles                 |
  |                                              |------- claim link --------------->|
  |                                              |                                  |
  |                                              |<--- claim: escrow -> private note |
```

| Leg | Actor | Proof | Automatable |
| --- | --- | --- | --- |
| Fund | Payer in wallet | yes | no — one signature per funding, not per payment |
| Operate | Almoner server | no | **yes, fully unattended** |
| Claim | Recipient in wallet | yes (theirs) | no — recipient-initiated by design |

A quarterly funding lets the server run monthly payroll with nobody present. When
StarkWare publishes a mainnet prover URL, the funding leg becomes automatable too —
built behind an adapter interface so it is one env var, not a rewrite.

## Components

| # | Component | Language | Notes |
| --- | --- | --- | --- |
| C1 | Escrow anonymizer contract | Cairo | Called by the pool via `privacy_invoke`. Claim-by-secret, expiry, refund-to-payer. Deployed to mainnet — fills `contracts` in `strk20.json` |
| C2 | Batch builder | TypeScript | CSV/recipient list to one `apply_actions`. Splits registered (direct note) from unregistered (escrow) |
| C3 | Payer dapp | Next.js | Wallet connect, capability probe, batch review, fund, dashboard |
| C4 | Claim page | Next.js | Recipient onboarding: connect, register viewing key, claim |
| C5 | Automation server | TypeScript | Scheduling, tracking, notification, expiry, refund. No proving |
| C6 | Wallet capability probe | TypeScript | `wallet_strk20Balances` detection. Published standalone — other teams need it |
| C7 | Payout receipts | TypeScript | Scoped disclosure of one payout for accounting. Read-only, unblocked by the prover gap |

C1–C5 are the product. C6 and C7 are the contributions other teams can depend on,
which the judging criteria explicitly reward.

## Phases

Front-loaded on risk: the single biggest unknown is whether any wallet actually
implements the STRK20 methods on mainnet. That is settled first, before anything is
built on top of the assumption.

| Phase | Days | Goal | Done when |
| --- | --- | --- | --- |
| **P0 Register** | 21 Aug | On the hub, repo live, docs in place | PR merged, repo public with a license |
| **P1 Reach the pool** | 22–23 Aug | Prove we can transact on mainnet at all | Viewing key registered, shielded balance held, **3 mainnet tx hashes in `strk20.json`** |
| **P2 Contract** | 23–26 Aug | C1 written, tested, deployed | Escrow on Sepolia then mainnet, address in `strk20.json` |
| **P3 Payer flow** | 26–28 Aug | C2 + C3 | A real batch funded on mainnet from the UI |
| **P4 Claim flow** | 27–29 Aug | C4 | An unregistered recipient onboards and claims end to end |
| **P5 Automation** | 29–30 Aug | C5 | Scheduled run executes unattended against a funded escrow |
| **P6 Ship** | 30–31 Aug | C6, C7, demo | Demo video, live URL, `strk20.json` complete, README final |

P1 is the critical path. Eligibility needs three mainnet pool transactions regardless of
what else ships, so they get done in the first 48 hours, not the last.

## Scope discipline

**In:** batch disbursement, escrow claim onboarding, unattended operation, receipts,
capability probe.

**Out, deliberately:**
- Server-initiated pool writes on mainnet — impossible today, and saying so plainly is
  better than faking it.
- Collection flows (checkout, invoicing, subscriptions) — the fee structure punishes
  them; that is the whole thesis.
- Cross-chain, sub-accounts, confidential compute — not shipped or not needed.
- Amount privacy at the pool boundary — cannot be delivered, so it is never claimed.

## Risks

| Risk | Impact | Response |
| --- | --- | --- |
| No wallet implements STRK20 on mainnet | Fatal to the whole route | Settled in P1 before anything depends on it. Fallback: drive flows through `strk20.starknet.io/app` and narrow scope to escrow + claim |
| Proof size caps batch recipients | Weakens the headline claim | Find the ceiling empirically in P3, publish the number, fall back to chunked batches |
| Deposit screening rejects an address | Blocks funding | Test early with a small amount; document the failure mode |
| Mainnet prover never arrives | Funding stays manual | Already the assumed case; automation is designed around it |
| Ten days, seven components | Overrun | P1–P4 is a complete, demoable product. P5–P7 are additive, and are cut in that order |
