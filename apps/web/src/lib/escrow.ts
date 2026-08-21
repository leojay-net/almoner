import { RpcProvider } from "starknet";

/** Mirrors the Cairo `AllocationStatus` enum, in declaration order. */
export const ALLOCATION_STATUS = ["None", "Funded", "Claimed", "Refunded"] as const;
export type AllocationStatus = (typeof ALLOCATION_STATUS)[number];

export interface Allocation {
  readonly token: string;
  readonly amount: bigint;
  /** Unix seconds; `0` never expires. */
  readonly expiry: bigint;
  readonly refundRecipient: string;
  readonly status: AllocationStatus;
}

/** Escrow address, empty until the contract is deployed. */
export const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? "";

/**
 * Provider pointed at our own proxy route, so the browser never holds an RPC key.
 */
export function browserProvider(): RpcProvider {
  return new RpcProvider({ nodeUrl: "/api/rpc" });
}

/**
 * Reads one allocation from the escrow.
 *
 * Only the **commitment hash** is sent — the secret stays in the browser. The
 * hash is public on-chain anyway, so this leaks nothing the chain does not
 * already show, while the bearer secret never crosses the network.
 */
export async function readAllocation(
  provider: RpcProvider,
  escrowAddress: string,
  commitmentHash: string,
): Promise<Allocation> {
  const result = await provider.callContract({
    contractAddress: escrowAddress,
    entrypoint: "get_allocation",
    calldata: [commitmentHash],
  });

  // AllocationEntry { token, amount, expiry, refund_recipient, status }
  if (result.length < 5) {
    throw new Error(`unexpected get_allocation response of ${result.length} felts`);
  }

  const statusIndex = Number(BigInt(result[4]!));
  const status = ALLOCATION_STATUS[statusIndex];
  if (status === undefined) {
    throw new Error(`unknown allocation status index ${statusIndex}`);
  }

  return {
    token: result[0]!,
    amount: BigInt(result[1]!),
    expiry: BigInt(result[2]!),
    refundRecipient: result[3]!,
    status,
  };
}

/** True when an allocation is past its expiry and can no longer be claimed. */
export function isExpired(allocation: Allocation, nowSeconds: bigint): boolean {
  return allocation.expiry !== 0n && nowSeconds >= allocation.expiry;
}
