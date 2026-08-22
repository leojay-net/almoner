# Calldata vectors

The pool deserializes invoke calldata straight into `privacy_invoke`'s parameters,
so the TypeScript encoder in `@almoner/core` and the Cairo signature in
`contracts/src/escrow.cairo` have to agree exactly. A mismatch is rejected on-chain
**after the payer has signed**, which is the worst possible place to find out.

So the same two vectors are asserted from both sides:

- `packages/core/src/actions.test.ts` — the encoder must emit exactly these arrays.
- `contracts/src/tests/test_escrow.cairo` — these arrays must deserialize through
  `Serde` into `(EscrowOperation, Span<Allocation>, Span<ClaimRequest>)`, be fully
  consumed with no trailing felts, and carry the expected values.

Change the signature or the encoder and one of the two suites fails.

## Regenerating

After changing `privacy_invoke`'s parameters or the encoder, rebuild `core` and
regenerate:

```bash
npm run build --workspace packages/core

node --input-type=module -e "
import { buildFundActions, buildClaimActions, planBatch } from './packages/core/dist/index.js';
let n = 0;
const plan = planBatch(
  [
    { recipient: '0x1', token: '0xaaa', amount: 100n, registered: false },
    { recipient: '0x2', token: '0xaaa', amount: 250n, registered: false },
  ],
  { refundRecipient: '0xfee', expiry: 1700000000n, makeSecret: () => \`0x\${(++n).toString(16)}\` },
);
const invoke = buildFundActions(plan, { escrowAddress: '0xe5c' }).find(a => a.type === 'invoke');
console.log('DEPOSIT:', JSON.stringify(invoke.calldata));
const claim = buildClaimActions(
  [{ secret: '0x1', token: '0xaaa' }, { secret: '0x2', token: '0xbbb' }],
  { escrowAddress: '0xe5c', recipient: '0xc1a1' },
);
console.log('CLAIM:', JSON.stringify(claim.at(-1).calldata));
"
```

Paste the output into both test files. In the Cairo vector, substitute real felts
for the `\${openNoteIds[N]}` placeholders — the wallet resolves those at assembly
time, so the contract only ever sees concrete note ids.

## What this does and does not prove

**Proves:** the encoder's field order, span lengths, enum variant indices and felt
widths match what the contract expects, and nothing trails.

**Does not prove:** that the *pool* accepts the surrounding action list — phase
ordering, the withdrawal leg, open-note indexing. Only a `strk20PrepareInvoke(actions, true)`
dry run against the real pool settles that, which is what the Dry run button on
`/pay` and `/claim` is for. Tracked as B7.
