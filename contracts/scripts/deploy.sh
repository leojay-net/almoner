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
# Requires starkli, and a keystore + account file:
#   starkli signer keystore new ~/.starkli/keys/almoner.json
#   starkli account fetch <ADDRESS> --output ~/.starkli/accounts/almoner.json --rpc <RPC>
#
# Env:
#   STARKNET_RPC              RPC URL for the target network (required)
#   STARKNET_ACCOUNT          path to the account file (required)
#   STARKNET_KEYSTORE         path to the keystore file (required)
#   POOL_ADDRESS              override the pool the escrow is pinned to (optional)

set -euo pipefail

NETWORK="${1:-}"
if [[ "$NETWORK" != "sepolia" && "$NETWORK" != "mainnet" ]]; then
  echo "usage: $0 <sepolia|mainnet>" >&2
  exit 2
fi

: "${STARKNET_RPC:?set STARKNET_RPC to the RPC URL for the target network}"
: "${STARKNET_ACCOUNT:?set STARKNET_ACCOUNT to your starkli account file}"
: "${STARKNET_KEYSTORE:?set STARKNET_KEYSTORE to your starkli keystore file}"

# Both verified on-chain, and cross-checked against @avnu/avnu-sdk's constants.
# The fee differs per network: 6 STRK on mainnet, 2 STRK on Sepolia.
MAINNET_POOL="0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a"
SEPOLIA_POOL="0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91"

if [[ "$NETWORK" == "sepolia" ]]; then
  POOL="${POOL_ADDRESS:-$SEPOLIA_POOL}"
else
  POOL="${POOL_ADDRESS:-$MAINNET_POOL}"
fi

# Refuse to pin the escrow to an address with no contract behind it. A zero-class
# pool means every privacy_invoke would revert, discovered only after funding.
echo "==> Verifying pool $POOL exists on $NETWORK"
if ! starkli class-hash-at "$POOL" --rpc "$STARKNET_RPC" >/dev/null 2>&1; then
  echo "ERROR: no contract deployed at $POOL on this network." >&2
  exit 1
fi

echo "==> Building"
scarb build

CLASS_FILE="target/dev/almoner_escrow_AlmonerEscrow.contract_class.json"
[[ -f "$CLASS_FILE" ]] || { echo "ERROR: $CLASS_FILE not found" >&2; exit 1; }

echo "==> Declaring class"
CLASS_HASH=$(starkli declare "$CLASS_FILE" --rpc "$STARKNET_RPC" --watch | tail -1)
echo "    class hash: $CLASS_HASH"

echo "==> Deploying, pinned to pool $POOL"
ADDRESS=$(starkli deploy "$CLASS_HASH" "$POOL" --rpc "$STARKNET_RPC" --watch | tail -1)

echo "==> Verifying deployment"
ON_CHAIN_POOL=$(starkli call "$ADDRESS" privacy_pool --rpc "$STARKNET_RPC" | tr -d '[]", \n')
if [[ "$(printf '%d' "$ON_CHAIN_POOL")" != "$(printf '%d' "$POOL")" ]]; then
  echo "ERROR: deployed contract reports pool $ON_CHAIN_POOL, expected $POOL" >&2
  exit 1
fi

cat <<SUMMARY

Deployed to $NETWORK
  escrow      $ADDRESS
  class hash  $CLASS_HASH
  pool        $POOL

Next:
  1. Add the address to apps/web/.env.local as NEXT_PUBLIC_ESCROW_ADDRESS
  2. Add it to apps/keeper/.env as ESCROW_ADDRESS, with ESCROW_FROM_BLOCK set to
     the block above so the keeper does not rescan the chain
  3. Add it to the "contracts" array in strk20.json
  4. Exercise a full cycle before funding anything real: fund, claim, expire, refund
SUMMARY
