# Escrow security review

**Status: self-review only.** This is a structured pass over `src/escrow.cairo` by
the same agent that wrote it. It is not an independent audit and does not close
[B6](../docs/STATE.md). Findings are recorded here so a human reviewer starts from
a map rather than a blank page.

Reviewed at commit time of the calldata-parity tests. 30 Cairo tests passing.

---

## S1 — A claim secret is public from the moment it is submitted

**Severity: medium. Design-inherent, not fixed.**

`privacy_invoke(Claim, …)` carries the secret in plaintext calldata. Between
submission and inclusion, anyone who can see the pending transaction can read the
secret and submit a competing claim into a note they own. The escrow cannot tell
the difference: knowledge of the preimage *is* the authorisation.

Starknet has no public peer-to-peer mempool, which narrows the window
considerably — but the sequencer and any relayer in the path do see it, and the
secret is permanently public on-chain afterwards.

Mitigations considered and rejected for now:

- **Bind the commitment to the recipient's address.** Removes the race entirely,
  but requires knowing the recipient's Starknet address at funding time — which
  defeats the entire purpose, since the point is paying people who have no
  account yet.
- **Two-phase commit-reveal on claim.** Costs a second transaction and a second
  6 STRK pool fee per claim, on a product whose thesis is fee amortisation.

**Current stance:** accepted and documented. A claim is a bearer instrument, and
the exposure window is one transaction. A production deployment handling large
per-allocation amounts should revisit this.

## S2 — Per-allocation amounts are public

**Severity: informational. Documentation defect, now fixed.**

`AllocationFunded` publishes `amount`, `expiry` and `refund_recipient` in
plaintext, keyed by commitment hash. So the *split* of an escrowed batch is fully
visible on-chain — only the recipients' identities are not, since they never
appear until they claim into a private note.

The pay page previously said the split between recipients was not visible. That
was wrong, and is corrected. Almoner claims **identity privacy, never amount
privacy** on the escrow leg — the same boundary STRK20 itself draws for deposits
and withdrawals.

## S3 — Residual allowance can accumulate

**Severity: low.**

`redeem` reads the standing allowance and adds to it, so several claims of one
token in a batch do not overwrite each other. If the pool ever pulls less than it
was approved for, the remainder persists as standing allowance and could later be
drawn against funds backing other allocations.

The pool is the trusted counterparty here and pulls exactly the returned
`OpenNoteDeposit` amounts, so this is not reachable today. A stricter design
would zero the allowance at the end of the call. Worth doing if the contract is
ever used with a helper less trusted than the pool.

## S4 — `expiry: 0` locks funds permanently

**Severity: low. By design.**

An allocation with no expiry can never be refunded, so an unclaimed one is
unrecoverable by anyone. This is deliberate — some payments should not be
clawable — but it is a foot-gun. The payer UI defaults to a 30-day window and
labels `0` explicitly.

## S5 — No pause, no upgrade path

**Severity: medium. Accepted for scope.**

The contract has no admin, no pause and no upgradeability. A bug found after
deployment strands whatever is escrowed until each allocation expires, and
permanently for any with `expiry: 0`.

This is a deliberate trade: an admin key is itself an attack surface, and a
sprint-scoped contract with an owner who can move funds is worse. The
consequence is that **deployment should be staged** — Sepolia first, then mainnet
with small amounts — rather than mitigated in code.

## S6 — `refund_batch` is all-or-nothing

**Severity: low. Mitigated operationally.**

One non-refundable member reverts the whole call. The keeper re-reads each
allocation on-chain before including it and caps batches at 25, so a surprise
costs a chunk rather than the sweep.

## S7 — Reentrancy through a malicious token

**Severity: low. Mitigated.**

`refund_one` writes state before transferring, so a token that calls back finds a
terminal status and reverts on `NOT_FUNDED`. `redeem` likewise writes before
approving. No path leaves a window where an allocation is both spendable and
still marked funded.

## S8 — Directly donated tokens can back allocations

**Severity: informational.**

`fund` asserts the contract's real ERC-20 balance covers total outstanding, so
tokens transferred to the contract outside a pool withdrawal count toward that
check. Not exploitable — the funds are genuinely present and claimable — but the
check proves solvency, not provenance.

---

## Before mainnet

- [ ] Independent human review by someone who did not write this
- [ ] A dedicated Cairo security tool or reviewer over the full source
- [ ] Sepolia deployment exercised end to end, including expiry and refund
- [ ] Mainnet deployment with small amounts first
- [ ] Re-verify `privacy::objects::OpenNoteDeposit` against the deployed pool
