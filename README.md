# Almoner

**Private batch disbursement on Starknet.** Pay many people at once from a shielded
balance — including people who have never touched the STRK20 pool — for a single flat
fee, without publishing who was paid or how much.

> An *almoner* is the officer appointed to distribute funds on someone else's behalf.
> Almsgiving was traditionally meant to be anonymous.

Built for the [STRK20 Private Sprint](https://github.com/starkience/strk20-hackathon).
Status: **in development.** Nothing here is audited. Do not put money you care about
through it.

---

## The problem

Two structural facts about the STRK20 pool decide what can profitably be built on it.
Both were verified against the deployed mainnet contract rather than taken from docs —
see [Verified protocol facts](#verified-protocol-facts).

**1. The pool fee is flat and charged per transaction, not per payment.**
`collect_fee()` runs exactly once per `apply_actions` call, and a single call can carry
any number of transfers across any number of tokens.

| Payout | Total fee | Per recipient |
| --- | --- | --- |
| 1 recipient | 6 STRK | 6 STRK |
| 50 recipients, batched | **6 STRK** | **0.12 STRK** |
| 50 recipients, one at a time | 300 STRK | 6 STRK |

Cross-payer batching is impossible — `__execute__` extracts exactly one
`(user_addr, user_private_key)` per transaction — so the pool is structurally cheap for
**paying many people** and structurally expensive for **collecting from many people**.
Almoner is built on the cheap side of that asymmetry.

**2. You cannot pay someone who has not registered with the pool.**
Both sender and recipient must have registered a viewing key first, and only the
recipient can do that for themselves. On a young pool that makes almost everyone
unreachable — a cold-start problem every payments product on STRK20 runs into.

Almoner closes both: batch the payment so the fee amortizes, and escrow for anyone not
yet registered so they can be paid before they arrive.

## How it works

Payments are split at the proof boundary, because every pool write requires a ZK proof
and there is currently no public mainnet proving service.

| Leg | Actor | Proof | What happens |
| --- | --- | --- | --- |
| **Fund** | Payer, in their wallet | yes | One `apply_actions` moves a budget into the escrow contract with N allocations. Registered recipients get a note directly; the rest get a claim. |
| **Operate** | Almoner server, unattended | **no** | Scheduling, recipient management, claim tracking, notification, expiry, refunds, reconciliation. Ordinary Starknet calls and off-chain work. |
| **Claim** | Recipient, in their wallet | yes (theirs) | Escrow releases into a private note they own. |

The payer signs once per *funding*, not once per payment — so a quarterly top-up lets
the server run monthly payroll unattended.

## What is private, and what is not

Being precise about this matters more than the feature list.

| Public | Private |
| --- | --- |
| That an address funded the pool, the token, and the amount | Which recipients were paid, and how much each received |
| That a claim happened, and the withdrawal amount if funds leave the pool | The link between a specific funding and a specific payout |
| Timing of every on-chain step | Recipient balances and the payer's remaining position |

**Almoner does not hide amounts at the pool boundary.** Shielding is a public ERC-20
leg: the deposit address, token and amount are visible. What stays hidden is the
distribution — who received what, inside the pool. A distinctive amount funded and
claimed shortly afterwards is correlatable, and we surface that in the UI rather than
pretending otherwise.

## Verified protocol facts

Claims here were checked against the deployed mainnet pool at
`0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a` and the
[protocol source](https://github.com/starkware-libs/starknet-privacy), because the
published documentation is inaccurate on all three.

| Fact | Reality | Docs say |
| --- | --- | --- |
| Pool fee | `get_fee_amount()` returns `6000000000000000000` — **6 STRK** | 4 STRK |
| Fee granularity | **Per `apply_actions` call.** `collect_fee()` is called once per transaction | "per private operation" |
| Proof-free writes | **None exist.** `validate_proof` asserts `!proof_facts_span.is_empty()` on every call, including registration and deposits | registration and shielding "need no proof at all" |

Reported upstream in
[starkience/strk20-hackathon#151](https://github.com/starkience/strk20-hackathon/issues/151).

## Development

Requires Node 24+, and [Scarb](https://docs.swmansion.com/scarb/) + starkli for the
Cairo side.

```bash
npm install
cp .env.example .env.local   # add your own Starknet RPC key; never commit it
npm run dev
```

Mainnet configuration is `CHAIN_ID=SN_MAIN` against the pool address above. RPC keys
live in environment variables only.

Agent skills used while building are pinned in `skills-lock.json` and restored with:

```bash
npx skills add welttowelt/strk20-skills
```

## Project documentation

- [`docs/PLAN.md`](docs/PLAN.md) — architecture, scope and delivery phases
- [`docs/STATE.md`](docs/STATE.md) — current status, decision log and next actions

## License

[MIT](LICENSE)
