import { walletV6 } from "starknet";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";

import { highestVersion, satisfiesMinimum } from "./version.js";

/**
 * The wallet type `walletV6.supportedWalletApi` actually accepts.
 *
 * Derived from starknet's own signature rather than imported by name, because
 * starknet bundles its own copy of the wallet-standard types. The identically
 * named `WalletWithStarknetFeatures` from `@starknet-io/get-starknet-wallet-standard`
 * is a *different nominal type* — each copy carries its own nested `types-js` —
 * so importing it directly fails to typecheck against starknet's parameter.
 * Deriving it keeps this correct across starknet version bumps.
 */
export type Strk20CapableWallet = Parameters<typeof walletV6.supportedWalletApi>[0];

/**
 * Either copy of the wallet-standard wallet type is accepted, so consumers are
 * not forced to match whichever one their dependency tree hoisted.
 */
export type AnyWalletStandardWallet = Strk20CapableWallet | WalletWithStarknetFeatures;

/**
 * Wallet API version that introduced the STRK20 methods (`strk20Balances`,
 * `strk20PrepareInvoke`, `strk20InvokeTransaction`).
 */
export const STRK20_MIN_WALLET_API = "0.10.3";

/** Why a wallet was classified the way it was. */
export type Strk20SupportReason =
  /** Wallet reports a Wallet API version at or above {@link STRK20_MIN_WALLET_API}. */
  | "supported"
  /** Wallet answered, but every version it reports predates STRK20. */
  | "below-minimum"
  /** Wallet answered with an empty version list. */
  | "no-versions-reported"
  /** The version query threw — wallet locked, disconnected, or not implementing it. */
  | "query-failed";

export interface Strk20Support {
  /** Whether STRK20 actions can be attempted against this wallet. */
  readonly supported: boolean;
  /** Every Wallet API version the wallet reported. */
  readonly versions: readonly string[];
  /** Highest reported version, or `null` if none were reported. */
  readonly highest: string | null;
  /** The minimum this check required. */
  readonly minimumRequired: string;
  readonly reason: Strk20SupportReason;
  /** Present only when `reason` is `"query-failed"`. */
  readonly error?: string;
}

export interface DetectOptions {
  /**
   * Override the minimum Wallet API version. Defaults to
   * {@link STRK20_MIN_WALLET_API}.
   */
  readonly minimumVersion?: string;
  /**
   * Abandon the query after this many milliseconds and report
   * `"query-failed"`. A wallet that never resolves would otherwise hang the
   * connect flow. Defaults to 5000. Pass `0` to wait indefinitely.
   */
  readonly timeoutMs?: number;
}

/**
 * Detects whether a connected wallet implements the STRK20 privacy wallet API.
 *
 * This asks the wallet which Wallet API versions it speaks. It deliberately does
 * **not** call `strk20Balances` to feature-detect: that method reads the user's
 * shielded balances, so wallets gate it behind a consent prompt for data a
 * capability check has no reason to see. Probing with it trains users to approve
 * balance access before they have chosen to do anything.
 *
 * Never throws — a wallet that fails the query is reported as unsupported with
 * `reason: "query-failed"`, which is the actionable outcome for a UI that needs
 * to offer a different path.
 */
export async function detectStrk20Support(
  wallet: AnyWalletStandardWallet,
  options: DetectOptions = {},
): Promise<Strk20Support> {
  const minimumRequired = options.minimumVersion ?? STRK20_MIN_WALLET_API;
  const timeoutMs = options.timeoutMs ?? 5000;

  let versions: readonly string[];
  try {
    versions = await withTimeout(
      walletV6.supportedWalletApi(wallet as Strk20CapableWallet),
      timeoutMs,
    );
  } catch (error) {
    return {
      supported: false,
      versions: [],
      highest: null,
      minimumRequired,
      reason: "query-failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (versions.length === 0) {
    return {
      supported: false,
      versions: [],
      highest: null,
      minimumRequired,
      reason: "no-versions-reported",
    };
  }

  const supported = versions.some((version) => satisfiesMinimum(version, minimumRequired));
  return {
    supported,
    versions,
    highest: highestVersion(versions),
    minimumRequired,
    reason: supported ? "supported" : "below-minimum",
  };
}

/** A human-readable line explaining a detection result, for UI or logs. */
export function describeStrk20Support(result: Strk20Support): string {
  switch (result.reason) {
    case "supported":
      return `Wallet supports the STRK20 API (Wallet API ${result.highest}).`;
    case "below-minimum":
      return `Wallet speaks Wallet API ${result.highest}, but STRK20 needs ${result.minimumRequired} or later.`;
    case "no-versions-reported":
      return "Wallet reported no Wallet API versions, so STRK20 support cannot be confirmed.";
    case "query-failed":
      return (
        "This wallet does not answer the Wallet API version query " +
        `(${result.error ?? "unknown error"}), so STRK20 support cannot be ` +
        "determined either way."
      );
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`wallet did not answer within ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
