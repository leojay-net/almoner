/**
 * Comparison helpers for Starknet Wallet API version strings such as `"0.10.3"`.
 *
 * These follow semantic-versioning ordering rules for the cases the Wallet API
 * actually produces: numeric dot-separated cores, optionally followed by a
 * prerelease suffix (`"0.10.4-beta.1"`). A prerelease sorts *below* the release
 * it leads to, so a wallet reporting only `"0.10.3-beta.4"` does not satisfy a
 * `"0.10.3"` minimum.
 */

/** Splits `"0.10.4-beta.1"` into its numeric core and prerelease tail. */
function splitVersion(version: string): { core: number[]; prerelease: string | null } {
  const [corePart = "", ...prereleaseParts] = version.trim().split("-");
  const core = corePart.split(".").map((segment) => {
    const parsed = Number.parseInt(segment, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  });
  return {
    core,
    prerelease: prereleaseParts.length > 0 ? prereleaseParts.join("-") : null,
  };
}

/**
 * Compares two Wallet API version strings.
 *
 * @returns a negative number if `a < b`, zero if equal, a positive number if `a > b`.
 */
export function compareWalletApiVersion(a: string, b: string): number {
  const left = splitVersion(a);
  const right = splitVersion(b);

  const segments = Math.max(left.core.length, right.core.length);
  for (let i = 0; i < segments; i += 1) {
    const diff = (left.core[i] ?? 0) - (right.core[i] ?? 0);
    if (diff !== 0) return diff;
  }

  // Equal numeric cores: a prerelease ranks below the corresponding release.
  if (left.prerelease === null && right.prerelease === null) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease.localeCompare(right.prerelease);
}

/** True when `version` is at least `minimum`. */
export function satisfiesMinimum(version: string, minimum: string): boolean {
  return compareWalletApiVersion(version, minimum) >= 0;
}

/** Returns the highest version in `versions`, or `null` when the list is empty. */
export function highestVersion(versions: readonly string[]): string | null {
  return versions.reduce<string | null>(
    (best, candidate) =>
      best === null || compareWalletApiVersion(candidate, best) > 0 ? candidate : best,
    null,
  );
}
