#!/usr/bin/env bash
#
# Vendors the Starknet Privacy SDK by building it from source.
#
# The package is published only to GitHub Packages, which needs a token with
# read:packages. Building from the public monorepo needs no credentials at all,
# so the project stays cloneable by anyone. Output is gitignored and rebuilt by
# this script.
#
#   ./scripts/vendor-sdk.sh
#
# Pin REF to a tag or commit when reproducibility matters more than freshness.

set -euo pipefail

REPO="https://github.com/starkware-libs/starknet-privacy.git"
REF="${SDK_REF:-main}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$ROOT/vendor"
WORK="$VENDOR/.src"
OUT="$VENDOR/starknet-privacy-sdk"

echo "==> Fetching $REPO@$REF (sdk/ only)"
rm -rf "$WORK"
mkdir -p "$WORK"
git clone --depth 1 --branch "$REF" --filter=blob:none --sparse "$REPO" "$WORK" >/dev/null 2>&1
git -C "$WORK" sparse-checkout set sdk >/dev/null

echo "==> Installing SDK dependencies"
( cd "$WORK/sdk" && npm install --no-audit --no-fund --silent )

echo "==> Building"
( cd "$WORK/sdk" && npm run build --silent )

echo "==> Staging into vendor/"
rm -rf "$OUT"
mkdir -p "$OUT"
cp -R "$WORK/sdk/dist" "$OUT/dist"
cp "$WORK/sdk/package.json" "$OUT/package.json"
[[ -f "$WORK/sdk/README.md" ]] && cp "$WORK/sdk/README.md" "$OUT/README.md"

# The published package resolves its own deps from the registry; as a local
# file: dependency it must declare them so npm installs them for us.
node -e "
const fs = require('fs');
const p = '$OUT/package.json';
const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
delete pkg.publishConfig;
delete pkg.devDependencies;
delete pkg.scripts;
// starknet must resolve to the host app's copy. Two copies give TypeScript two
// nominal identities for RpcProvider and Account, and every argument stops
// matching across the boundary.
const deps = pkg.dependencies || {};
if (deps.starknet) {
  pkg.peerDependencies = Object.assign({}, pkg.peerDependencies, { starknet: deps.starknet });
  delete deps.starknet;
}
pkg.dependencies = deps;
fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
console.log('    deps :', Object.keys(pkg.dependencies).join(', '));
console.log('    peer :', Object.keys(pkg.peerDependencies || {}).join(', '));
"

rm -rf "$WORK"
echo "==> Done: $OUT"
echo "    version $(node -p "require('$OUT/package.json').version")"
