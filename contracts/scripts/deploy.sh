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

# Two ways to sign, in preference order:
#   ACCOUNT_NAME  - a name in sncast's accounts file. The key is stored there
#                   directly, so this needs no password.
#   ACCOUNT_FILE + KEYSTORE_FILE - starkli-format pair. Password-protected.
ACCOUNT_NAME="${ACCOUNT_NAME:-}"
ACCOUNT_FILE="${ACCOUNT_FILE:-$HOME/.starkli/accounts/starkbet_deployer.json}"
KEYSTORE_FILE="${KEYSTORE_FILE:-$HOME/.starkli/keystores/starkbet_deployer.json}"

if [[ -z "$ACCOUNT_NAME" ]]; then
  [[ -f "$ACCOUNT_FILE" ]]  || { echo "ERROR: account file not found: $ACCOUNT_FILE" >&2; exit 1; }
  [[ -f "$KEYSTORE_FILE" ]] || { echo "ERROR: keystore not found: $KEYSTORE_FILE" >&2; exit 1; }
fi

# Both verified on-chain and cross-checked against @avnu/avnu-sdk's constants.
# The fee differs per network: 6 STRK on mainnet, 2 STRK on Sepolia.
MAINNET_POOL="0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a"
SEPOLIA_POOL="0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91"
if [[ "$NETWORK" == "sepolia" ]]; then
  POOL="${POOL_ADDRESS:-$SEPOLIA_POOL}"
else
  POOL="${POOL_ADDRESS:-$MAINNET_POOL}"
fi

if [[ -n "$ACCOUNT_NAME" ]]; then
  CAST=(sncast --profile "$NETWORK" --account "$ACCOUNT_NAME")
else
  CAST=(sncast --profile "$NETWORK" --account "$ACCOUNT_FILE" --keystore "$KEYSTORE_FILE")
fi

# sncast prompts for the keystore password on the terminal. With no TTY and no
# KEYSTORE_PASSWORD set, that prompt fails as "Device not configured (os error
# 6)", which says nothing useful. Catch it here instead.
if [[ -z "$ACCOUNT_NAME" && ! -t 0 && -z "${KEYSTORE_PASSWORD:-}" ]]; then
  cat >&2 <<'NOTTY'
ERROR: no terminal to prompt for the keystore password, and KEYSTORE_PASSWORD is unset.

Either run this from a real terminal window:

    cd "$(pwd)" && ./scripts/deploy.sh <network>

or supply the password without putting it in shell history:

    read -rs KEYSTORE_PASSWORD && export KEYSTORE_PASSWORD
    ./scripts/deploy.sh <network>
NOTTY
  exit 3
fi

# Refuse to pin the escrow to an address with no pool behind it. A wrong pool
# makes every privacy_invoke revert, discovered only after funding a batch.
echo "==> Verifying pool $POOL on $NETWORK"
if ! sncast --profile "$NETWORK" call --contract-address "$POOL" \
      --function get_fee_amount >/dev/null 2>&1; then
  echo "ERROR: $POOL does not answer get_fee_amount on $NETWORK." >&2
  exit 1
fi
FEE=$(sncast --json --profile "$NETWORK" call --contract-address "$POOL" \
        --function get_fee_amount 2>/dev/null | python3 -c "
import json, sys
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        continue
    if 'response_raw' in obj:
        print(int(obj['response_raw'][0], 16) / 10**18)
        break
")
echo "    pool fee: $FEE STRK per transaction"

echo "==> Building"
scarb build

# sncast --json prints one JSON object per line, warnings included.
field() { python3 -c "
import json, sys
key = sys.argv[1]
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        continue
    if key in obj:
        print(obj[key]); break
" "$1"; }

CLASS_HASH=$(starkli class-hash target/dev/almoner_escrow_AlmonerEscrow.contract_class.json)
echo "==> Declaring AlmonerEscrow ($CLASS_HASH)"
DECLARE_OUT=$("${CAST[@]}" --json declare --contract-name AlmonerEscrow 2>&1 || true)
DECLARE_ERR=$(printf '%s' "$DECLARE_OUT" | field error)

if [[ -n "$DECLARE_ERR" ]]; then
  # An already-declared class is the one failure that is fine to continue past;
  # anything else means the deploy below would fail confusingly.
  if printf '%s' "$DECLARE_ERR" | grep -qiE "already declared|is already"; then
    echo "    already declared, continuing"
  else
    echo "ERROR: declare failed: $DECLARE_ERR" >&2
    exit 1
  fi
else
  echo "    declared in $(printf '%s' "$DECLARE_OUT" | field transaction_hash)"
fi

# A declare returns as soon as it is submitted, not when it is accepted. Deploying
# straight away fails with "Class ... is not declared", which reads like the
# declare failed when it actually succeeded. sncast has no wait flag, so poll.
export NETWORK_PROFILE="$NETWORK"
echo "==> Waiting for the class to be accepted"
for attempt in $(seq 1 40); do
  if sncast --json --profile "$NETWORK" call \
       --contract-address "$POOL" --function get_fee_amount >/dev/null 2>&1 \
     && python3 - "$CLASS_HASH" <<'PYWAIT'
import json, sys, urllib.request, tomllib, pathlib
class_hash = sys.argv[1]
cfg = tomllib.loads(pathlib.Path("snfoundry.toml").read_text())
import os
url = cfg["sncast"][os.environ["NETWORK_PROFILE"]]["url"]
req = urllib.request.Request(url, data=json.dumps({"jsonrpc":"2.0","id":1,
    "method":"starknet_getClass","params":{"block_id":"latest","class_hash":class_hash}}).encode(),
    headers={"content-type":"application/json","user-agent":"almoner/0.1"})
try:
    r = json.loads(urllib.request.urlopen(req, timeout=25).read())
    sys.exit(0 if "result" in r else 1)
except Exception:
    sys.exit(1)
PYWAIT
  then
    echo "    accepted after ${attempt} check(s)"
    break
  fi
  [[ $attempt -eq 40 ]] && { echo "ERROR: class never became visible" >&2; exit 1; }
  sleep 6
done

echo "==> Deploying, pinned to pool $POOL"
DEPLOY_OUT=$("${CAST[@]}" --json deploy --class-hash "$CLASS_HASH" \
  --constructor-calldata "$POOL" 2>&1 || true)
DEPLOY_ERR=$(printf '%s' "$DEPLOY_OUT" | field error)
if [[ -n "$DEPLOY_ERR" ]]; then
  echo "ERROR: deploy failed: $DEPLOY_ERR" >&2
  exit 1
fi

ESCROW=$(printf '%s' "$DEPLOY_OUT" | field contract_address)
[[ -n "$ESCROW" ]] || { echo "ERROR: no contract address in deploy output" >&2; exit 1; }
echo "    escrow: $ESCROW"

echo "==> Verifying the deployed escrow points at the right pool"
ON_CHAIN=$(sncast --json --profile "$NETWORK" call --contract-address "$ESCROW" \
  --function privacy_pool 2>/dev/null | python3 -c "
import json, sys
for line in sys.stdin:
    try: obj = json.loads(line.strip())
    except Exception: continue
    if 'response_raw' in obj:
        print(int(obj['response_raw'][0], 16)); break
")
# Compared in python: a felt is 252 bits and bash printf overflows on it.
if ! python3 -c "import sys; sys.exit(0 if int('$ON_CHAIN') == int('$POOL', 16) else 1)"; then
  echo "ERROR: escrow reports pool $ON_CHAIN, expected $POOL" >&2
  exit 1
fi
echo "    confirmed"

cat <<SUMMARY

Deployed to $NETWORK
  escrow      $ESCROW
  class hash  $CLASS_HASH
  pool        $POOL

Next:
  1. Verify: sncast --profile $NETWORK call --contract-address <ESCROW> --function privacy_pool
  2. NEXT_PUBLIC_ESCROW_ADDRESS in apps/web/.env.local
  3. ESCROW_ADDRESS + ESCROW_FROM_BLOCK in apps/keeper/.env
  4. "contracts" array in strk20.json
  5. Exercise a full cycle before funding anything real: fund, claim, expire, refund
SUMMARY
