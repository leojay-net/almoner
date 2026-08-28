"use client";

import { hash, num } from "starknet";

import { POOL_ADDRESS } from "./chain";

/**
 * Whether an account has registered a viewing key with the pool.
 *
 * Read from the pool's `get_public_key` view, not by scanning `ViewingKeySet`
 * events. The event scan was the original approach and it does not work on
 * mainnet: the pool was deployed at block 8,978,970 and the tip is past 14M, so
 * finding a single event means paging through five million blocks — measured at
 * 40 pages and 32 seconds without reaching it. A registered account was
 * therefore reported "unknown", the UI read that as "no pool position", and it
 * asked people to shield again when they already had a balance.
 *
 * The view answers in about half a second and cannot be wrong: a zero public key
 * means no registration, anything else means registered.
 */
const GET_PUBLIC_KEY = hash.getSelectorFromName("get_public_key");

export type RegistrationStatus = "registered" | "unregistered" | "unknown";

interface RpcResponse {
  result?: string[];
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
 * One RPC call, no paging.
 *
 * Returns `"unknown"` only when the call itself failed. Callers should treat
 * that as unregistered, because escrow works for everyone whereas a direct
 * transfer to an unregistered recipient reverts and takes the whole atomic
 * batch with it.
 */
export async function checkRegistration(address: string): Promise<RegistrationStatus> {
  try {
    const response = await rpc("starknet_call", {
      request: {
        contract_address: POOL_ADDRESS,
        entry_point_selector: GET_PUBLIC_KEY,
        calldata: [num.toHex(BigInt(address))],
      },
      block_id: "latest",
    });
    if (response.error || !response.result || response.result.length === 0) return "unknown";
    return BigInt(response.result[0]!) === 0n ? "unregistered" : "registered";
  } catch {
    return "unknown";
  }
}

/** Resolves registration for many addresses, with a small concurrency limit. */
export async function checkRegistrations(
  addresses: readonly string[],
  concurrency = 6,
): Promise<Map<string, RegistrationStatus>> {
  const results = new Map<string, RegistrationStatus>();
  const queue = [...new Set(addresses.map((a) => num.toHex(BigInt(a))))];

  async function worker() {
    for (;;) {
      const address = queue.shift();
      if (address === undefined) return;
      results.set(address, await checkRegistration(address));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return results;
}
