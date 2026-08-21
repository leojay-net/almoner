import { Account, RpcProvider, type Call } from "starknet";

import { EVENT_SELECTOR, type RawEvent } from "./events.ts";
import type { KeeperConfig } from "./config.ts";

const CHUNK_SIZE = 500;
/** Blocks to re-scan on every pass, so a reorg cannot drop an event. */
const REORG_BUFFER = 32;

export interface Chain {
  readonly provider: RpcProvider;
  blockNumber(): Promise<number>;
  blockTimestamp(): Promise<bigint>;
  fetchEvents(fromBlock: number, toBlock: number): Promise<RawEvent[]>;
  allocationStatus(commitmentHash: string): Promise<number>;
  refundBatch(commitmentHashes: readonly string[]): Promise<string>;
}

export function createChain(config: KeeperConfig): Chain {
  const provider = new RpcProvider({ nodeUrl: config.rpcUrl });

  return {
    provider,

    async blockNumber() {
      return provider.getBlockNumber();
    },

    /**
     * Chain time, not wall time. The contract compares expiry against the block
     * timestamp, so the keeper must decide against the same clock.
     */
    async blockTimestamp() {
      const block = await provider.getBlock("latest");
      return BigInt(block.timestamp);
    },

    async fetchEvents(fromBlock, toBlock) {
      const events: RawEvent[] = [];
      let continuationToken: string | undefined;

      do {
        const page = await provider.getEvents({
          address: config.escrowAddress,
          from_block: { block_number: Math.max(fromBlock, 0) },
          to_block: { block_number: toBlock },
          keys: [[EVENT_SELECTOR.funded, EVENT_SELECTOR.claimed, EVENT_SELECTOR.refunded]],
          chunk_size: CHUNK_SIZE,
          ...(continuationToken === undefined ? {} : { continuation_token: continuationToken }),
        });
        events.push(...(page.events as unknown as RawEvent[]));
        continuationToken = page.continuation_token;
      } while (continuationToken !== undefined);

      return events;
    },

    /** Reads the live status enum, to confirm state before spending gas. */
    async allocationStatus(commitmentHash) {
      const result = await provider.callContract({
        contractAddress: config.escrowAddress,
        entrypoint: "get_allocation",
        calldata: [commitmentHash],
      });
      if (result.length < 5) throw new Error("unexpected get_allocation response");
      return Number(BigInt(result[4]!));
    },

    async refundBatch(commitmentHashes) {
      const account = new Account({
        provider,
        address: config.accountAddress,
        signer: config.privateKey,
      });
      const call: Call = {
        contractAddress: config.escrowAddress,
        entrypoint: "refund_batch",
        calldata: [commitmentHashes.length.toString(), ...commitmentHashes],
      };
      const { transaction_hash } = await account.execute(call);
      await provider.waitForTransaction(transaction_hash);
      return transaction_hash;
    },
  };
}

/** Start block for the next scan, rewound by the reorg buffer. */
export function scanFrom(cursorBlock: number, fromBlock: number): number {
  return Math.max(cursorBlock + 1 - REORG_BUFFER, fromBlock, 0);
}
