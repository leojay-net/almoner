"use client";

import { hash } from "starknet";

import { POOL_ADDRESS, POOL_DEPLOY_BLOCK } from "./chain";
import { normalizeAddress } from "./address";

/**
 * `ViewingKeySet` is emitted once when an account registers with the pool, with
 * the account address as the first data key. That event is the proof of
 * enrolment, and the only way to tell from outside whether an address can
 * receive a private transfer.
 */
const VIEWING_KEY_SET = hash.getSelectorFromName("ViewingKeySet");

/** Pages to follow before giving up on a negative answer. */
const MAX_PAGES = 6;
const CHUNK_SIZE = 1000;

export type RegistrationStatus = "registered" | "unregistered" | "unknown";

interface RpcResponse {
  result?: { events?: unknown[]; continuation_token?: string };
  error?: { message?: string };
}

async function rpc(method: string, params: unknown): Promise<RpcResponse> {
  const response = await fetch("/api/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await response.json()) as RpcResponse;
}

/**
 * Asks whether an address has registered a viewing key with the pool.
 *
 * A positive answer is cheap — stop at the first event. A negative one is not:
 * proving absence means scanning to the chain tip, so paging is capped and an
 * exhausted budget returns `"unknown"` rather than a confident `"unregistered"`.
 *
 * Callers should treat `"unknown"` as unregistered, because that routes the
 * payout through escrow, which works for everyone. The opposite mistake is the
 * costly one: a direct transfer to an unregistered recipient reverts, and a
 * batch is atomic, so it would take the whole run down with it.
 */
export async function checkRegistration(address: string): Promise<RegistrationStatus> {
  const target = normalizeAddress(address);
  let continuationToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const filter: Record<string, unknown> = {
      from_block: { block_number: POOL_DEPLOY_BLOCK },
      to_block: "latest",
      address: POOL_ADDRESS,
      keys: [[VIEWING_KEY_SET], [target]],
      chunk_size: CHUNK_SIZE,
    };
    if (continuationToken !== undefined) filter.continuation_token = continuationToken;

    const response = await rpc("starknet_getEvents", { filter });
    if (response.error || !response.result) return "unknown";

    if ((response.result.events?.length ?? 0) > 0) return "registered";

    continuationToken = response.result.continuation_token;
    if (continuationToken === undefined) return "unregistered";
  }

  return "unknown";
}

/** Resolves registration for many addresses, with a small concurrency limit. */
export async function checkRegistrations(
  addresses: readonly string[],
  concurrency = 4,
): Promise<Map<string, RegistrationStatus>> {
  const results = new Map<string, RegistrationStatus>();
  const queue = [...new Set(addresses.map(normalizeAddress))];

  async function worker() {
    for (;;) {
      const address = queue.shift();
      if (address === undefined) return;
      try {
        results.set(address, await checkRegistration(address));
      } catch {
        results.set(address, "unknown");
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return results;
}
