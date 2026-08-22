#!/usr/bin/env bash
#
# Declare and deploy the Almoner escrow.
#
# Sepolia first, always. The contract has no admin, no pause and no upgrade path,
# so a mistake is permanent - see SECURITY.md (S5).
#
#   ./scripts/deploy.sh sepolia
#   ./scripts/deploy.sh mainnet
#
# Uses sncast rather than starkli: starkli 0.4.2 speaks an older JSON-RPC spec
# than current endpoints serve and fails with "Invalid params" on every call.
# sncast ships with the starknet-foundry version pinned in ../.tool-versions.
#
# Env:
#   ACCOUNT_FILE    starkli-format account JSON  (default ~/.starkli/accounts/starkbet_deployer.json)
#   KEYSTORE_FILE   starkli-format keystore JSON (default ~/.starkli/keystores/starkbet_deployer.json)
#   POOL_ADDRESS    override the pool the escrow is pinned to
#
# The keystore is password-protected; sncast will prompt.

set -euo pipefail

NETWORK="${1:-}"
if [[ "$NETWORK" != "sepolia" && "$NETWORK" != "mainnet" ]]; then
  echo "usage: $0 <sepolia|mainnet>" >&2
  exit 2
fi

ACCOUNT_FILE="${ACCOUNT_FILE:-$HOME/.starkli/accounts/starkbet_deployer.json}"
KEYSTORE_FILE="${KEYSTORE_FILE:-$HOME/.starkli/keystores/starkbet_deployer.json}"
[[ -f "$ACCOUNT_FILE" ]]  || { echo "ERROR: account file not found: $ACCOUNT_FILE" >&2; exit 1; }
[[ -f "$KEYSTORE_FILE" ]] || { echo "ERROR: keystore not found: $KEYSTORE_FILE" >&2; exit 1; }

# Both verified on-chain and cross-checked against @avnu/avnu-sdk's constants.
# The fee differs per network: 6 STRK on mainnet, 2 STRK on Sepolia.
MAINNET_POOL="0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a"
SEPOLIA_POOL="0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91"
if [[ "$NETWORK" == "sepolia" ]]; then
  POOL="${POOL_ADDRESS:-$SEPOLIA_POOL}"
else
  POOL="${POOL_ADDRESS:-$MAINNET_POOL}"
fi

CAST=(sncast --profile "$NETWORK" --account "$ACCOUNT_FILE" --keystore "$KEYSTORE_FILE")

# Refuse to pin the escrow to an address with no pool behind it. A wrong pool
# makes every privacy_invoke revert, discovered only after funding a batch.
echo "==> Verifying pool $POOL on $NETWORK"
if ! sncast --profile "$NETWORK" call --contract-address "$POOL" \
      --function get_fee_amount >/dev/null 2>&1; then
  echo "ERROR: $POOL does not answer get_fee_amount on $NETWORK." >&2
  exit 1
fi
FEE=$(sncast --json --profile "$NETWORK" call --contract-address "$POOL" \
        --function get_fee_amount 2>/dev/null | python3 -c \
        "import json,sys;print(int(json.load(sys.stdin)['response_raw'][0],16)/10**18)")
echo "    pool fee: $FEE STRK per transaction"

echo "==> Building"
scarb build

echo "==> Declaring AlmonerEscrow"
"${CAST[@]}" declare --contract-name AlmonerEscrow || true

echo "==> Deploying, pinned to pool $POOL"
"${CAST[@]}" deploy --class-hash "$(starkli class-hash target/dev/almoner_escrow_AlmonerEscrow.contract_class.json)" \
  --constructor-calldata "$POOL"

cat <<SUMMARY

Deployed to $NETWORK, pinned to pool $POOL

Next:
  1. Verify: sncast --profile $NETWORK call --contract-address <ESCROW> --function privacy_pool
  2. NEXT_PUBLIC_ESCROW_ADDRESS in apps/web/.env.local
  3. ESCROW_ADDRESS + ESCROW_FROM_BLOCK in apps/keeper/.env
  4. "contracts" array in strk20.json
  5. Exercise a full cycle before funding anything real: fund, claim, expire, refund
SUMMARY
