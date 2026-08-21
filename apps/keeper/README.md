# @almoner/keeper

Unattended keeper. Tracks escrow allocations and refunds expired, unclaimed ones
to the payer.

## Why this can run unattended

Every pool write requires a ZK proof, and there is no public mainnet proving
service — so nothing that touches the pool can be automated today. The keeper
sidesteps that entirely: **`refund` is an ordinary public Starknet call on our
own contract**, so it needs no proof, no proving service, and no viewing key.

That is the whole reason Almoner splits at the proof boundary. The payer signs
once per funding; everything afterwards — tracking, expiry, refunds,
reconciliation — runs here with nobody present.

| Leg | Needs a proof | Automatable |
| --- | --- | --- |
| Fund a batch | yes | no — one wallet signature per funding |
| Claim | yes (the recipient's) | no — recipient-initiated by design |
| **Track, expire, refund** | **no** | **yes, this process** |

## Run it

```bash
cp .env.example .env
npm run sweep:once -- --dry-run   # see what it would do
npm start                          # continuous
```

`--dry-run` never signs and needs no key. `--once` runs a single pass, which is
what a cron or CI job wants.

## What a pass does

1. Scan escrow events since the last cursor, rewound by 32 blocks so a reorg
   cannot silently drop one.
2. Fold `AllocationFunded` / `Claimed` / `Refunded` into local state.
3. Select allocations past expiry plus a grace period.
4. **Re-read each one on-chain** before spending gas.
5. Call `refund_batch` in chunks.
6. Persist the cursor and state atomically.

## Details that matter

**Chain time, not wall time.** The contract compares expiry against the block
timestamp, so the keeper decides against the same clock. A default 120-second
grace period absorbs the drift — refunding a moment early just reverts and
wastes gas.

**Verify before spending.** Local state goes stale: a recipient may have claimed
since the last scan. `refund_batch` reverts wholesale if any member is no longer
refundable, so each commitment is re-read first and batches stay small — a
surprise costs a chunk, not the sweep.

**Terminal states are sticky.** The reorg buffer replays recent blocks every
pass. Without a guard, a replayed `AllocationFunded` would reset a claimed
allocation and the keeper would try to refund money that has already moved.

**Failures are survivable.** A reverted batch is logged and retried next pass. A
transient RPC error does not kill the process. A corrupt state file is discarded
and rebuilt from chain.

## The keeper key

`KEEPER_PRIVATE_KEY` controls an ordinary Starknet account that signs public
`refund` calls and nothing else. It holds no viewing key, no shielded balance,
and cannot move funds anywhere except the refund address fixed when each
allocation was created — the contract enforces that, not this process.
**Compromising it costs gas, not user money.** Use a dedicated account regardless.

`refund` is permissionless by design, so anyone can run a keeper against the
escrow. Nothing here is privileged.

## Tests

```bash
npm test    # 25 tests
```

Sweep selection, event decoding and a full pass against a fake chain — including
the stale-state, reverted-batch and replayed-event paths.
