# @almoner/strk20-capability

Detect whether a connected Starknet wallet implements the **STRK20 privacy wallet
API** — without triggering a consent prompt.

Extracted from [Almoner](https://github.com/leojay-net/almoner) because every STRK20
dapp needs this and the ecosystem has no published list of which wallets support the
methods. MIT, no runtime dependencies of its own.

## Why this exists

STRK20 actions are executed wallet-side: the wallet holds the viewing key, discovers
notes, generates the ZK proof and submits. So a dapp cannot offer a private action
until it knows the connected wallet speaks the API — and
[the documentation states](https://strk20-by-example.org/starknet-wallet-api/overview)
that support varies and there is no published list.

## Detect with a version query, not a balance call

The obvious probe is to call `strk20Balances` and see whether it throws. **Don't.**
It is a balance-reading method, so wallets gate it behind a user consent prompt for
the user's shielded balances — data a capability check has no reason to see. Probing
with it asks users to approve balance access before they have chosen to do anything,
and a decline is indistinguishable from a wallet that lacks support.

This package asks which Wallet API versions the wallet speaks, which is metadata and
prompts nobody. STRK20 landed in Wallet API `0.10.3`.

```ts
import { detectStrk20Support, describeStrk20Support } from "@almoner/strk20-capability";

const result = await detectStrk20Support(wallet);

if (result.supported) {
  // safe to build STRK20_ACTION[] and call strk20InvokeTransaction
} else {
  showFallbackPath(describeStrk20Support(result));
}
```

## Result shape

`detectStrk20Support` never throws. A wallet that fails the query is reported as
unsupported, because "offer a different path" is the same UI outcome either way.

| `reason` | Meaning |
| --- | --- |
| `supported` | Reports Wallet API ≥ 0.10.3 |
| `below-minimum` | Answered, but every version predates STRK20 |
| `no-versions-reported` | Answered with an empty list |
| `query-failed` | Threw or timed out — locked, disconnected, or not implementing it |

Also returned: `versions` (everything reported), `highest`, `minimumRequired`, and
`error` when the query failed.

```ts
await detectStrk20Support(wallet, {
  minimumVersion: "0.10.3", // override the minimum
  timeoutMs: 5000,          // 0 waits indefinitely; default 5000
});
```

A wallet that never answers would otherwise hang the connect flow, so the query is
bounded by default.

## Version comparison

Wallet API versions are compared numerically, not lexically — `"0.10.3"` is above
`"0.9.0"`, which string comparison gets backwards. A prerelease ranks below its
release, so `"0.10.3-beta.4"` does not satisfy a `"0.10.3"` minimum.

`compareWalletApiVersion`, `satisfiesMinimum` and `highestVersion` are exported for
reuse.

## Peer dependencies

```
starknet >= 10.4.0
@starknet-io/get-starknet-wallet-standard >= 6.0.3
```

**Pin `starknet` deliberately.** STRK20 support ships on the npm `next` tag; `latest`
resolved to `10.0.2` as of 21 Aug 2026 and contains none of `WalletAccountV6`,
`strk20InvokeTransaction` or `STRK20_ACTION`.

`detectStrk20Support` accepts either copy of the wallet-standard wallet type. starknet
bundles its own, so the identically named type from the standalone package is a
different nominal type — this package absorbs that mismatch instead of passing it on.

## License

MIT
