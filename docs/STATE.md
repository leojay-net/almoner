# Almoner — state

Living handoff. **Read this first in any new session.** Update it as reality changes,
in the same commit as the work it describes.

- **Last updated:** 21 August 2026
- **Current phase:** P1 Reach the pool (P0 Register complete)
- **Days to deadline:** 10 (31 August, 23:59 UTC)

## Next action

**Run the capability check against a real wallet.** The tool is built and tested
(`packages/strk20-capability`, surfaced at `/` in the web app) but has never been run
against an actual browser wallet, so B1 is still open. Install Ready or Braavos, switch
to Mainnet, `npm run dev`, and record what each wallet reports.

If no wallet reports Wallet API 0.10.3+, the Wallet API route is dead and the plan
changes shape — so this is settled before any product code is written on top of it.

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
| B1 | Does **any** wallet implement STRK20 on mainnet? | **Open — blocking.** Detection tool is built and unit-tested; needs one run against a real browser wallet |
| B2 | Mainnet proving service URL unpublished | Open upstream (#121, #124, #135, #147). Designed around; not blocking |
| B3 | Max recipients per batch before proof-size limits | Unknown. Docs give no number. Measure in P3 and publish it |
| B4 | Does deposit screening reject ordinary addresses? | Unknown. Test with a small amount in P1 |
| B5 | Needs a funded mainnet wallet (~25–30 STRK covers three pool transactions at 6 STRK each plus gas) and an Alchemy RPC key in `apps/web/.env.local` | Open — user action |
| B6 | Escrow contract has had **no human security review**. It holds real funds | Open — gate before any deploy. Checklist in `contracts/README.md` |
| B7 | Calldata layout for `privacy_invoke` is written to spec, never exercised against the real pool | Open — settle with `strk20PrepareInvoke(actions, true)` dry run |

## Key identifiers

| | |
| --- | --- |
| Pool (mainnet) | `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a` |
| Chain | `SN_MAIN` / `0x534e5f4d41494e` |
| Pool fee | 6 STRK per `apply_actions` call |
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
