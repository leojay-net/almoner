"use client";

import { useCallback, useSyncExternalStore } from "react";

import { CHAIN_ID } from "./chain";

/**
 * A local record of a payment this browser sent.
 *
 * There is a real question behind this file: after you make a private payment,
 * where do you go to see that it happened? The honest answer is that the pool
 * cannot tell you. That is the whole point of it. A private transfer spends
 * notes and creates notes, and the amounts and recipients are encrypted to
 * keys the chain does not hold, so no explorer and no indexer — including one
 * we could write — can reconstruct "who did Leo pay". If it could, the pool
 * would not be private.
 *
 * What *is* public is the envelope: your account sent a transaction to the pool
 * at a particular block, and it succeeded or reverted. Anyone can verify that
 * much on Voyager. So the split is:
 *
 *   - the chain proves the payment settled  (hash, block, status)
 *   - your own device remembers what it was (recipients, amounts, links)
 *
 * Hence localStorage. It never leaves the browser, which is the only place the
 * detail can live without leaking it to a server. The tradeoff is real and we
 * state it in the UI: clear your browser data and the detail is gone, though
 * the transaction itself stays on-chain and stays valid forever.
 */
export interface Receipt {
  /** Transaction hash — the part anyone can verify on an explorer. */
  readonly hash: string;
  /** Which network, so Sepolia tests never show up in a mainnet list. */
  readonly chainId: string;
  /** Payer, so switching accounts switches the list. */
  readonly account: string;
  /** Unix ms, from the sending device. */
  readonly at: number;
  readonly directCount: number;
  readonly escrowedCount: number;
  /** Sum of all payouts, in the token's smallest unit. */
  readonly totalFri: string;
  readonly token: string;
  /** Pool fee charged for the batch, smallest unit. */
  readonly feeFri: string;
  /** Filled in once we have asked the chain. */
  status?: "pending" | "accepted" | "reverted";
  blockNumber?: number;
}

const KEY = "almoner.receipts.v1";
const listeners = new Set<() => void>();

/**
 * `useSyncExternalStore` compares snapshots by reference, so this has to be a
 * stable array that only changes identity when the data actually changes.
 * Re-parsing localStorage on every render would return a new array each time
 * and spin forever.
 */
let cache: readonly Receipt[] | null = null;

function read(): readonly Receipt[] {
  if (cache !== null) return cache;
  if (typeof window === "undefined") return (cache = []);
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    cache = Array.isArray(parsed) ? (parsed as Receipt[]) : [];
  } catch {
    // Corrupt or unavailable storage must not take the page down with it.
    cache = [];
  }
  return cache;
}

function write(next: readonly Receipt[]): void {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private-mode quota failures are survivable: the list still works for
    // this session, it just will not outlive the tab.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Server render has no localStorage; both snapshots must agree to avoid a hydration mismatch. */
const EMPTY: readonly Receipt[] = [];
const serverSnapshot = () => EMPTY;

export function recordReceipt(receipt: Receipt): void {
  // Re-recording the same hash should update it, not duplicate it.
  const rest = read().filter((r) => r.hash !== receipt.hash);
  write([receipt, ...rest].slice(0, 200));
}

export function updateReceipt(hash: string, patch: Partial<Receipt>): void {
  const current = read();
  if (!current.some((r) => r.hash === hash)) return;
  write(current.map((r) => (r.hash === hash ? { ...r, ...patch } : r)));
}

export function clearReceipts(): void {
  write([]);
}

/** Receipts for the connected account on the active network, newest first. */
export function useReceipts(account: string | null): readonly Receipt[] {
  const all = useSyncExternalStore(subscribe, read, serverSnapshot);
  const key = account === null ? null : normalize(account);
  return all.filter((r) => r.chainId === CHAIN_ID && (key === null || normalize(r.account) === key));
}

function normalize(address: string): string {
  try {
    return BigInt(address).toString();
  } catch {
    return address;
  }
}

/**
 * Ask the chain whether a submitted transaction actually settled.
 *
 * A hash coming back from `invoke` means the sequencer accepted it, not that it
 * executed — a batch can still revert. Showing "sent" for a reverted payment
 * would be the worst kind of wrong, so every pending receipt gets checked.
 */
export async function confirmReceipt(hash: string): Promise<void> {
  try {
    const response = await fetch("/api/rpc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "starknet_getTransactionReceipt",
        params: { transaction_hash: hash },
      }),
    });
    const body = (await response.json()) as {
      result?: { execution_status?: string; block_number?: number };
    };
    const status = body.result?.execution_status;
    if (status === undefined) return; // Not in a block yet; leave it pending.
    updateReceipt(hash, {
      status: status === "SUCCEEDED" ? "accepted" : "reverted",
      blockNumber: body.result?.block_number,
    });
  } catch {
    // Offline or rate-limited: stay pending rather than claim a status we do
    // not have.
  }
}

/** Confirms every receipt still marked pending. Safe to call repeatedly. */
export function useConfirmPending(receipts: readonly Receipt[]): () => void {
  return useCallback(() => {
    for (const r of receipts) {
      if (r.status === undefined || r.status === "pending") void confirmReceipt(r.hash);
    }
  }, [receipts]);
}
