# Almoner — state

Living handoff. **Read this first in any new session.** Update it as reality changes,
in the same commit as the work it describes.

- **Last updated:** 26 August 2026
- **Current phase:** P1 Reach the pool (P0 Register complete)
- **Days to deadline:** 5 (31 August, 23:59 UTC)

## Verified by testing against real wallets, 26 Aug

Three findings that are not written down anywhere upstream, each of which cost real
debugging time:

1. **Ready's STRK20 backend serves mainnet only.** The identical deposit action
   returns `UNKNOWN_ERROR` (code 163) on Sepolia and `NOT_REGISTERED` (code 118) on
   mainnet. The Sepolia failure comes back in ~25ms — far too fast to have attempted
   proving, which takes ~29s — so its backend is refusing outright, not failing to
   prove. **Sepolia cannot be used to test the Wallet API route.**
2. **`supportedWalletApi` does not tell you this.** It reports what the wallet
   *implements*, not what its backend serves *per network*. Ready reports `0.10.3`
   on both networks while only one works, so a capability probe cannot detect it.
3. **Registration is a prerequisite and is not expressible through the Wallet API.**
   The action union is `deposit | withdraw | transfer | invoke` — there is no
   register action. A dapp cannot register a user; it has to happen in the wallet's
   own UI or at `strk20.starknet.io/app`. The docs saying wallets "register on first
   use" does not hold for Ready, which returns `NOT_REGISTERED` instead.

Consequence: the Sepolia escrow at `0x055e0d…8e8e` is deployed and healthy but cannot
be exercised end to end, because no wallet will prove against Sepolia.

## Route B proved on Sepolia, 26 Aug

**A real proof was generated against the Sepolia pool in ~6s** — the first time
anything in this project has exercised the pool's write path. Reproduce with
`node scripts/prove-check.mjs` after sourcing `apps/web/.env.local`:

```
PROOF GENERATED in 6.0s
  entrypoint : apply_actions      calldata : 59 felts
  proofFacts : 9                  proof    : 308720 bytes
  NOT SUBMITTED
```

Notes that cost time to establish:

- **`builder.simulate()` does not test the prover.** The SDK documents it as fee
  estimation "without real proof generation" — it passed in 3.1s against a
  service it never contacted. `builder.execute()` is the real test, and it still
  submits nothing: submission is a separate `account.execute(callAndProof.call)`.
  So proving is free to verify on any network, mainnet included.
- **`autoRegister: true` clears the NOT_REGISTERED wall.** The account has never
  registered a viewing key and the proof still generated, because registration is
  bundled into the transaction. On the wallet route this is impossible — the
  action union has no register action.
- **The SDK is vendored from source** (`scripts/vendor-sdk.sh`), so no
  `read:packages` token is needed and the repo stays cloneable by anyone.
- **starknet must be a single copy.** The SDK wants 10.5.0; we pinned 10.4.0, and
  the nested copy gave TypeScript two nominal identities for `RpcProvider` and
  `Account` so nothing matched across the boundary. All workspaces are on 10.5.0
  and the vendored package declares starknet as a peer.

## What has and has not been tested on Sepolia, 26 Aug

| | |
| --- | --- |
| `scripts/prove-check.mjs` | proves against the live pool, ~6s |
| `/api/strk20` (`op: prepare`) | **proves through the app** — 9 proof facts, ~310KB |
| `/api/strk20` (`op: invoke`) | never succeeded — submission blocked |
| escrow `privacy_invoke` path | correctly rejected: no shielded balance to withdraw from |
| the app UI end to end | **not tested** |

A bug this surfaced: the SDK route's `prepare` originally called `simulate()`,
which the SDK documents as fee estimation "without real proof generation". It
returned success against a prover it never contacted — the opposite of what a
"test first" button is for, and inconsistent with the wallet route, whose
prepare genuinely proves. Both branches now call `execute()`, which proves
without submitting.

Everything past a deposit is gated on submission, which is blocked by Braavos v3
fee validation: "exceed balance" is returned identically for a 0.11 STRK cap and
a 4700 STRK cap against a 136 STRK balance, so the message is not describing the
real constraint.

## Next action

**Deploy the escrow to Sepolia and dry-run a batch.** B1 is closed, so the route is
confirmed and the remaining sequence is short: Sepolia deploy → `strk20PrepareInvoke`
dry run (settles B7) → mainnet deploy → three mainnet transactions → fill `strk20.json`.

Blocked on a human review of the contract (B6) and a funded account.

**Correction from the original plan:** do *not* feature-detect by calling
`wallet_strk20Balances`, which the Day-0 doc suggests. It reads shielded balances, so
wallets gate it behind a consent prompt for data a capability check has no business
seeing, and a user declining is indistinguishable from a wallet lacking support. The
official skill says to use a version query instead, which is what we implemented.

## Status

### Done
- Four STRK20 agent skills installed, pinned in `skills-lock.json`
- Protocol research: fee model, proof requirements, batching limits, prover availability
  (see verified facts in [`../CLAUDE.md`](../CLAUDE.md))
- Competitive read: 114 registered projects; Payments 23 and DeFi 18 are saturated,
  Infra 12, Tooling 6, Gaming 4
- Upstream doc corrections filed: [strk20-hackathon#156](https://github.com/starkience/strk20-hackathon/issues/156)
- Repository initialised: README, LICENSE (MIT), `strk20.json`, `CLAUDE.md`, plan and state
- **Project scaffolded**: npm workspaces, Next.js 16 + React 19 + Tailwind 4 in
  `apps/web`, Prettier, ESLint. `npm test` / `lint` / `typecheck` / `build` all green,
  0 vulnerabilities
- **C6 built**: `packages/strk20-capability` — STRK20 wallet support detection via
  version query, 17 unit tests, publishable, documented
- Landing page renders the capability panel
- **C1 drafted**: `contracts/` Cairo escrow anonymizer — batch funding, commitment
  claims, expiry refunds. Compiles against the real `privacy` package (git dep),
  **26 snforge tests passing**. Toolchain pinned to scarb 2.18.0 / snforge 0.63.0 to
  match the privacy monorepo. **Draft: unreviewed, unaudited, not deployed**
- **C2 built**: `packages/core` — batch planning, commitment hashing, and the fund
  and claim action builders with pool phase ordering. 29 tests
- **Commitment parity proven across languages.** The same Poseidon vector is
  asserted in both the TypeScript and Cairo suites, so a drift that would make every
  claim link unredeemable fails the build on both sides
- **C4 built**: `/claim` page — link parsing, on-chain allocation lookup, wallet
  connect, dry run and submit, with every allocation state handled
- **RPC proxy** at `/api/rpc`: read-only method allowlist, batch cap, server-held
  Alchemy key. Verified live against mainnet — allowed methods pass, writes return
  403, and reading the pool's `get_fee_amount` through it returns 6 STRK, confirming
  the fee finding by a second independent path
- **C3 built**: `/pay` — recipient paste, per-line validation, on-chain registration
  detection, batch review with fee, claim-link export, dry run and fund
- **Registration detection works.** `ViewingKeySet` events keyed by address, queried
  from the pool's deploy block. Verified live: a registered address returns 1 event,
  an unregistered one returns 0
- **Pool deploy block found: 8,978,970** (binary search on `getClassHashAt`, 24 calls).
  Scanning from block 0 pages through ~9M empty blocks and never returns
- **C5 built**: `apps/keeper` — unattended tracker and expiry sweeper. Event scan
  with a 32-block reorg buffer, atomic state persistence, on-chain re-verification
  before spending gas, chunked `refund_batch`, dry-run and single-pass modes
- **Keeper verified against live mainnet**: scanned ~12,800 blocks, persisted its
  cursor, and a second run resumed at the next block instead of rescanning
- **Calldata parity pinned both ways.** The literal output of `buildFundActions`
  and `buildClaimActions` is deserialized in Cairo through the same `Serde` path
  the pool uses — fully consumed, values checked — and the same vectors are
  asserted in the TypeScript suite. Encoder or signature drifting fails a build
- **Escrow security self-review written** (`contracts/SECURITY.md`), eight findings
- **Privacy overclaim corrected.** The review found the pay page and README
  claiming the escrow split was hidden. It is not: `AllocationFunded` publishes each
  amount in plaintext. Identity privacy is real; amount privacy on the escrow leg
  never was
- **CI added and green**: TypeScript and Cairo suites on every push, plus
  `scarb fmt --check` and a production audit. Took four rounds to go green, and
  every failure was a real portability bug the local suite could not have found:
  Next-generated types missing before a build, Linux native binaries absent from a
  macOS-generated lockfile (npm/cli#4828), and scarb racing itself resolving the
  same git dependency on a cold cache
- **Deploy script**: `contracts/scripts/deploy.sh <sepolia|mainnet>` — verifies the
  pool exists before pinning to it, and reads `privacy_pool` back after deploying
- **B1 answered against real wallets.** Ready X supports STRK20 (Wallet API 0.10.3);
  MetaMask is too old at 0.7; Braavos does not answer the version query, so it is
  unknown rather than unsupported. This is the first published data point on wallet
  support — the STRK20 docs state no such list exists
- **Badge accuracy fixed.** The capability UI reported two states where there are
  three, showing "No STRK20" for a wallet that had merely failed to answer. Asserting
  absence from missing evidence is the same overclaiming error the security review
  caught in the privacy copy, in reverse
- **Interface rebuilt as a real SaaS app.** Design system (one primary + three
  semantic colours, no decorative gradients, fluid display type), drawn icon set,
  motion vocabulary, sidebar shell with a shared active indicator, and routes:
  `/` landing, `/app` overview, `/app/{pay,claim,activity,wallet}`, and `/claim`
  as a standalone public page for link recipients
- Verification totals: **121 tests green** (49 core + 25 keeper + 17 capability +
  30 Cairo), typecheck and lint clean, 0 vulnerabilities, no secrets in git
- Fork of the hackathon repo created at `leojay-net/strk20-hackathon`

- **Registered.** [strk20-hackathon#157](https://github.com/starkience/strk20-hackathon/pull/157)
  applied to upstream `main` as `a5fc256` by `strk20-sprint-bot`; entry verified live in
  `registry.json` (116 entries). The PR shows *closed*, not *merged* — that is the normal
  path: the bot rebuilds each entry on top of whatever landed while the PR was open, so
  registrations cannot delete each other and no conflict ever needs resolving. The commit
  is credited to us. **No second PR is ever opened**
- GitHub repository published at https://github.com/leojay-net/almoner

### In progress
- P1. Capability tooling is built but **not yet validated against a real wallet**
- P2. Escrow contract drafted and tested locally; needs security review, then Sepolia
- P3. Done — batch builder and payer UI both built, unproven against a real wallet
- P4. Claim page done, but end-to-end unproven: it needs a deployed escrow and a
  STRK20-capable wallet, so it currently renders the pre-deploy state
- P5. Done — keeper built and smoke-tested; it has never swept a real allocation
  because none exist yet

### Next (P1, by 23 Aug)
- [x] Build the wallet capability probe (C6)
- [ ] **Run it against Ready and Braavos on mainnet — B1 is still open**
- [ ] Register a viewing key on the mainnet pool
- [ ] Shield a small STRK amount
- [ ] Make a third pool transaction
- [ ] Record all three hashes in `strk20.json`

Eligibility needs three mainnet pool transactions regardless of what else ships. They
get done first, not last.

## Decision log

| Date | Decision | Why |
| --- | --- | --- |
| 21 Aug | Escrow takes **batches**, not one allocation per call | The pool allows at most one external invoke per transaction, so a batch payout must carry every allocation in a single `privacy_invoke` |
| 21 Aug | `refund` is **permissionless and proof-free** | It is the automation story: a keeper sweeps expired allocations unattended. Funds can only reach the refund address fixed at funding time, so opening it costs nothing |
| 22 Aug | A wallet that fails the version query is **"Unknown"**, never "No" | Braavos answers "Not implemented" to `wallet_supportedWalletApi`. That is missing evidence, not evidence of absence — it may well support STRK20 without supporting the query |
| 22 Aug | `/claim` sits **outside** the app shell | A recipient arriving from a link is not a user of this product and may never be. Sidebar navigation into features they cannot use is noise; the page has one task |
| 22 Aug | Colour is **semantic only** | One primary for "act", three semantics for the only states money is in here — settled, waiting, wrong. A colour that means nothing does not get used |
| 22 Aug | Claim-secret exposure in calldata is **accepted, not fixed** | Binding commitments to a recipient address would remove the race but requires knowing their address at funding time, which defeats paying people with no account. A commit-reveal claim costs a second 6 STRK fee on a product built on fee amortisation. Documented as S1 |
| 22 Aug | Keeper decides against **chain time**, with a grace period | The contract compares expiry to the block timestamp. Deciding on wall clock would submit refunds a moment early, which revert and waste gas |
| 22 Aug | Keeper **re-reads each allocation on-chain** before refunding | Local state goes stale when a recipient claims mid-cycle, and `refund_batch` reverts wholesale — so an unverified chunk is wasted gas |
| 21 Aug | Funding is **gated on exporting the claim links** | Secrets exist only in the payer's browser tab. Funding without saving them strands every escrowed payment until the refund window — so the Fund button stays disabled until the CSV is downloaded |
| 21 Aug | An **undetermined** registration is treated as unregistered | Escrow works for everyone; a direct transfer to an unregistered recipient reverts, and the batch is atomic, so that mistake would take the whole run down |
| 21 Aug | Claim secrets ride in the **URL fragment**, never the path or query | Browsers never transmit the fragment. A bearer secret in the query would be written to server logs, proxy logs and `Referer` headers, from where anyone with log access could drain the allocation |
| 21 Aug | The browser talks to chain through **our own read-only proxy** | Keeps the Alchemy key server-side. The allowlist stops it becoming an open relay for somebody else's write traffic |
| 21 Aug | Claim secrets are **bearer tokens**, never stored server-side | Whoever holds the secret can claim. Keeping it out of logs, storage and URL paths is the only thing protecting an unclaimed allocation |
| 21 Aug | Action builders assert **pool phase order** | The pool rejects out-of-order actions only after the user has signed, so it is caught at build time instead |
| 21 Aug | Capability detection uses a **version query**, not `strk20Balances` | The Day-0 doc suggests probing with the balance call; the official skill says not to, because it prompts the user for balance access a capability check has no reason to see |
| 21 Aug | Build private **batch disbursement**, not collection | Verified: the 6 STRK fee is per transaction. Batching amortizes it for payouts; collection pays it per customer. The pool's economics pick a side and we build on it |
| 21 Aug | **Wallet API route**, not the SDK route | No public mainnet proving service exists; server-held keys cannot prove on mainnet. Wallets ship a prover endpoint we do not have |
| 21 Aug | Automation split at the **proof boundary** | Every pool write needs a proof, so the server automates everything except value entering the pool. One signature per funding, not per payment |
| 21 Aug | Category **Infra** | Payments has 23 entries and DeFi 18. Infra is less crowded and the honest description of a rail others build on |
| 21 Aug | Name **Almoner** | "Sluice" collides with an existing crypto batched-payments project. Almoner = the officer who distributes funds on another's behalf; npm and GitHub clear |
| 21 Aug | Own Cairo escrow contract rather than reusing a helper | Integration depth is 30% of scoring and explicitly names anonymizer contracts; also required so demo transactions carry our own event |

## Blockers and open questions

| # | Item | Status |
| --- | --- | --- |
| B1 | Does **any** wallet implement STRK20 on mainnet? | **CLOSED, 22 Aug.** Yes — **Ready X reports Wallet API `0.10.3`**. Braavos does not implement the version query at all ("Not implemented"), so its support is *unknown* rather than absent. MetaMask reports only `0.7`, definitively too old. **Ready X is the wallet to build and demo against** |
| B2 | Mainnet proving service URL unpublished | Open upstream (#121, #124, #135, #147). Designed around; not blocking |
| B3 | Max recipients per batch before proof-size limits | Unknown. Docs give no number. Measure in P3 and publish it |
| B4 | Does deposit screening reject ordinary addresses? | Unknown. Test with a small amount in P1 |
| B5 | Needs a funded mainnet wallet (~25–30 STRK covers three pool transactions at 6 STRK each plus gas) and an Alchemy RPC key in `apps/web/.env.local` | Open — user action |
| B6 | Escrow contract has had **no human security review**. It holds real funds | Open — a structured self-review is written up in `contracts/SECURITY.md` with eight findings, but a self-review is not an audit. Gate before any deploy |
| B7 | Calldata layout for `privacy_invoke` is written to spec, never exercised against the real pool | **Narrowed.** The encoder's output now provably deserializes into the contract signature (both suites pin the vectors), so field order, span lengths and enum indices are settled. What remains unproven is whether the *pool* accepts the surrounding action list — phase order, withdrawal leg, open-note indexing. The Dry run button settles that; needs B1 |

## Key identifiers

| | |
| --- | --- |
| Pool (mainnet) | `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a` |
| Chain | `SN_MAIN` / `0x534e5f4d41494e` |
| Pool fee | 6 STRK per `apply_actions` call |
| Pool deploy block | 8,978,970 — the floor for every event query |
| `ViewingKeySet` selector | `0x1321a492485b4f19851fb787ab3800a0030b595332cba93cd5fe40dfb5a4daf` |
| STRK (mainnet) | `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` |
| Repo | `leojay-net/almoner` |
| Telegram | `easybrane` |
| Hub | https://strk20.starknet.io/hackathon |

## Notes for the next session

- `demo_url` is picked up automatically from the repository **Website** field — set it
  as soon as anything is deployed. That is the most reliable of the three detection paths.
- The hub re-reads the repository every 30 minutes. Pushes are visible publicly, so
  commit history is part of the submission.
- Nothing is submitted at the end. Whatever the repository shows at the deadline *is*
  the entry.
