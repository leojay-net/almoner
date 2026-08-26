"use client";

import type { STRK20_ACTION } from "@starknet-io/types-js";

/**
 * How a STRK20 transaction gets proved and submitted.
 *
 * There are two viable routes and they are viable on different networks, which
 * is not a detail the rest of the app should have to know:
 *
 *   wallet — the user's privacy wallet proves and submits. No prover URL needed,
 *            but the wallet's backend decides which networks work. Ready serves
 *            mainnet only: the same action returns NOT_REGISTERED on mainnet and
 *            a 500 in ~25ms on Sepolia, too fast to have attempted proving.
 *
 *   sdk    — we hold a key and reach a proving service ourselves. Works wherever
 *            a prover is reachable; StarkWare runs one for Sepolia
 *            (transaction-prover.alpha-sepolia.sw-dev.io answers /health).
 *
 * Everything above this interface is route-agnostic, so switching is config, not
 * a rewrite.
 */
export type RouteKind = "wallet" | "sdk";

export interface InvokeResult {
  readonly transaction_hash: string;
}

export interface Strk20Executor {
  readonly kind: RouteKind;
  /** Account the actions are executed as. */
  readonly address: string;
  /** Human label for the UI, e.g. "Ready X" or "local key". */
  readonly label: string;
  /** Prove without submitting. Costs nothing on-chain. */
  prepare(actions: STRK20_ACTION[]): Promise<unknown>;
  /** Prove and submit. */
  invoke(actions: STRK20_ACTION[]): Promise<InvokeResult>;
}

/** The route this build is configured for. */
export const ROUTE: RouteKind =
  process.env.NEXT_PUBLIC_STRK20_ROUTE === "sdk" ? "sdk" : "wallet";

export function describeRoute(kind: RouteKind): string {
  return kind === "wallet"
    ? "your wallet proves and submits"
    : "this app proves through a proving service and submits with a local key";
}
