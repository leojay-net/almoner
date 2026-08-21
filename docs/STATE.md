# Almoner — state

Living handoff. **Read this first in any new session.** Update it as reality changes,
in the same commit as the work it describes.

- **Last updated:** 21 August 2026
- **Current phase:** P0 Register → moving into P1 Reach the pool
- **Days to deadline:** 10 (31 August, 23:59 UTC)

## Next action

**Settle whether any Starknet wallet implements the STRK20 methods on mainnet.**
Everything else is built on that assumption and it is not yet verified. Probe a
connected wallet with `wallet_strk20Balances` — it is read-only and safe to call
against any wallet. A wallet answering "not implemented" means the plan changes, so
this happens before any product code.

Reference: PugarHuda's ~20-line MIT probe, linked from
[strk20-hackathon#121](https://github.com/starkience/strk20-hackathon/issues/121).

## Status

### Done
- Four STRK20 agent skills installed, pinned in `skills-lock.json`
- Protocol research: fee model, proof requirements, batching limits, prover availability
  (see verified facts in [`../CLAUDE.md`](../CLAUDE.md))
- Competitive read: 114 registered projects; Payments 23 and DeFi 18 are saturated,
  Infra 12, Tooling 6, Gaming 4
- Upstream doc corrections filed: [strk20-hackathon#156](https://github.com/starkience/strk20-hackathon/issues/156)
- Repository initialised: README, LICENSE (MIT), `strk20.json`, `CLAUDE.md`, plan and state
- Fork of the hackathon repo created at `leojay-net/strk20-hackathon`

### In progress
- Registration PR against `starkience/strk20-hackathon` `registry.json`

### Next (P1, by 23 Aug)
- [ ] Wallet capability probe on mainnet — the blocking unknown
- [ ] Register a viewing key on the mainnet pool
- [ ] Shield a small STRK amount
- [ ] Make a third pool transaction
- [ ] Record all three hashes in `strk20.json`

Eligibility needs three mainnet pool transactions regardless of what else ships. They
get done first, not last.

## Decision log

| Date | Decision | Why |
| --- | --- | --- |
| 21 Aug | Build private **batch disbursement**, not collection | Verified: the 6 STRK fee is per transaction. Batching amortizes it for payouts; collection pays it per customer. The pool's economics pick a side and we build on it |
| 21 Aug | **Wallet API route**, not the SDK route | No public mainnet proving service exists; server-held keys cannot prove on mainnet. Wallets ship a prover endpoint we do not have |
| 21 Aug | Automation split at the **proof boundary** | Every pool write needs a proof, so the server automates everything except value entering the pool. One signature per funding, not per payment |
| 21 Aug | Category **Infra** | Payments has 23 entries and DeFi 18. Infra is less crowded and the honest description of a rail others build on |
| 21 Aug | Name **Almoner** | "Sluice" collides with an existing crypto batched-payments project. Almoner = the officer who distributes funds on another's behalf; npm and GitHub clear |
| 21 Aug | Own Cairo escrow contract rather than reusing a helper | Integration depth is 30% of scoring and explicitly names anonymizer contracts; also required so demo transactions carry our own event |

## Blockers and open questions

| # | Item | Status |
| --- | --- | --- |
| B1 | Does **any** wallet implement STRK20 on mainnet? | **Open — blocking.** P1 settles it |
| B2 | Mainnet proving service URL unpublished | Open upstream (#121, #124, #135, #147). Designed around; not blocking |
| B3 | Max recipients per batch before proof-size limits | Unknown. Docs give no number. Measure in P3 and publish it |
| B4 | Does deposit screening reject ordinary addresses? | Unknown. Test with a small amount in P1 |

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
