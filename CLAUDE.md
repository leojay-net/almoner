# Almoner — working agreement

Private batch disbursement on STRK20 (Starknet privacy pool), built for the
STRK20 Private Sprint. Deadline **31 August 2026, 23:59 UTC**.

## Start every session here

1. Read [`docs/STATE.md`](docs/STATE.md) — current position, next action, decision log.
2. Read [`docs/PLAN.md`](docs/PLAN.md) — architecture and phases. Only if the task needs it.
3. Do **not** re-derive the verified protocol facts below. They cost real research and are
   correct as of 21 Aug 2026. Re-verify only if something behaves unexpectedly.

## Commit convention

**Every small change is committed on its own, with a commit message describing that
change.** Not one commit at the end of a session, not a batch of unrelated edits under
"updates" — a change and its message travel together.

- Present tense, imperative: "Add claim expiry to escrow contract", not "added" or "changes".
- The message says *what changed and why it matters*, not which files moved.
- Commit as soon as a change stands on its own, even if the next one follows a minute later.
- The sprint hub reads pushed commits every 30 minutes and shows them publicly, so commit
  history is part of the submission, not bookkeeping.

## Update `docs/STATE.md` as you go

STATE.md is the handoff to the next session. Keep it true:

- Move items between **Done / In progress / Next** as reality changes.
- Append to the decision log when a real choice is made, with the reason.
- Record new verified facts, with how they were verified.
- Log blockers the moment they appear, and remove them when they clear.

Update it in the same commit as the work it describes wherever that makes sense.

## Verified protocol facts — do not re-derive

Checked against the live mainnet pool `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`
and [starkware-libs/starknet-privacy](https://github.com/starkware-libs/starknet-privacy).
Published docs are wrong on all three; reported upstream as
[strk20-hackathon#156](https://github.com/starkience/strk20-hackathon/issues/156).

| Fact | Reality |
| --- | --- |
| Pool fee | `get_fee_amount()` = `6000000000000000000` FRI = **6 STRK** (docs say 4) |
| Fee granularity | **Per `apply_actions` call**, not per operation. `collect_fee()` runs once per transaction, so batching amortizes it |
| Proof-free writes | **None.** `validate_proof` asserts `!proof_facts_span.is_empty()` on every call, registration and deposits included |
| Cross-payer batching | **Impossible.** `__execute__` extracts one `(user_addr, user_private_key)` per transaction |
| Mainnet prover | **Does not exist publicly.** StarkWare's own `demo/.env.mainnet.example` reads `TODO_MAINNET_PROVER_URL`; no prover crate in the repo |
| Consequence | Every mainnet pool write must originate from a privacy-enabled wallet. Server-side automation covers everything *except* the moment value enters the pool |

## Hard rules

- **Never commit secrets.** RPC keys, private keys and API keys live in `.env.local`,
  which is gitignored. `.env.example` carries placeholder names only.
- **Never overclaim privacy.** Deposits and withdrawals are public ERC-20 legs — address,
  token and amount are visible. Only the in-pool distribution is private. Judges score
  integration depth, and overclaiming is the fastest way to lose those points.
- **Mainnet is real money.** Test on Sepolia; use small amounts on mainnet.
- The repository must stay **public with a license** to remain eligible.

## Stack

Next.js dapp on the Starknet Wallet API route, plus a Cairo escrow anonymizer contract
invoked by the pool through `privacy_invoke`. Scarb and starkli are installed locally.

Agent skills are pinned in `skills-lock.json`; restore with
`npx skills add welttowelt/strk20-skills`. `.agents/` and `.claude/` are gitignored.
