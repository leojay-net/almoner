# Almoner escrow contract

> [!WARNING]
> **Draft. Not reviewed, not audited, not deployed.** An anonymizer contract holds
> real funds and is the app team's code to own, review and audit. This one was
> drafted with an AI agent and has had no human security review. It must not go to
> mainnet in this state.

The Cairo helper behind Almoner's cold-start problem: you cannot privately transfer
to someone who has not registered a viewing key, and only they can register. So the
payer parks funds behind a commitment, the recipient claims into their own note once
registered, and anything unclaimed at expiry is refundable.

## How the pool drives it

The pool withdraws the batch total to this contract, then calls `privacy_invoke`
through `INVOKE_SELECTOR` — one atomic transaction, one flat 6 STRK pool fee no
matter how many recipients are in the batch.

```
Fund   pool --withdraw total--> escrow --privacy_invoke(Deposit, allocations)--> parks, returns []
Claim  recipient's wallet --privacy_invoke(Claim, claims)--> approves pool, returns Span<OpenNoteDeposit>
Refund keeper --refund(commitment)--> plain ERC-20 transfer to the payer's refund address
```

Deposit returns an **empty span**: the tokens stay parked, so there is nothing for
the pool to credit yet. Claim returns one `OpenNoteDeposit` per redeemed commitment
and **approves** the pool rather than transferring — the pool executes the pull.

`refund` is an ordinary public entry point requiring no proof, which is what lets a
keeper sweep expired allocations unattended while the mainnet proving service is
unavailable. It is permissionless on purpose: funds can only ever reach the refund
address fixed at funding time, so letting anyone trigger it costs nothing.

## Design notes

**Funding is checked against real balance.** After each allocation the contract
asserts it actually holds what it now owes for that token (`outstanding` per token
vs `balance_of`). Without it a batch allocating more than the pool withdrew would
mint claims payable out of other users' escrowed funds. `fund_rejects_a_batch_the_pool_did_not_cover`
and `fund_rejects_a_batch_that_overruns_partway_through` cover it.

**Allowance accumulates within a batch.** `approve` overwrites, so claiming two
allocations of the same token in one transaction with a naive per-claim approve
would leave the pool able to pull only the last amount. The contract reads the
standing allowance and adds to it.

**Status is a single state machine.** `None → Funded → Claimed | Refunded`. One
`status` check rejects unknown commitments, double claims, and claim-after-refund
alike.

**Commitments are domain-separated.** `poseidon(ALMONER_COMMITMENT_TAG, secret)`, so
a commitment here cannot collide with a hash used elsewhere. Only the hash is
published; the secret travels to the recipient out of band.

**Checks, effects, interactions.** State is written before any external call in both
claim and refund.

## Privacy boundaries

`refund` is a **public ERC-20 transfer** to the refund address. It is visible on
chain with its amount, and links that address to the escrow. Use a fresh address for
refunds if that link matters. Claims are private — the recipient's note is credited
inside the pool.

## Build and test

Requires the toolchain pinned in `../.tool-versions` (scarb 2.18.0,
starknet-foundry 0.63.0), which matches the privacy monorepo.

```bash
scarb build
snforge test     # 26 tests
scarb fmt
```

The `privacy` package is a git dependency on
[starkware-libs/starknet-privacy](https://github.com/starkware-libs/starknet-privacy).

## Before this is deployed

- [ ] Human security review by someone who did not write it
- [ ] Run a dedicated Cairo security review pass
- [ ] Re-verify `privacy::objects::OpenNoteDeposit` against the deployed pool's version
- [ ] Confirm the calldata layout matches what the wallet sends for `privacy_invoke`
- [ ] Dry run with `strk20PrepareInvoke(actions, true)` before any real submission
- [ ] Deploy and exercise on Sepolia first
