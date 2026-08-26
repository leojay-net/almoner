"use client";

import type { WalletAccountV6 } from "starknet";
import type { STRK20_ACTION } from "@starknet-io/types-js";

import type { InvokeResult, Strk20Executor } from "./executor";
import { withWalletTimeout } from "./wallet-error";

/** Route A: the user's privacy wallet proves and submits. */
export function walletExecutor(account: WalletAccountV6, label: string): Strk20Executor {
  return {
    kind: "wallet",
    address: account.address,
    label,
    prepare(actions: STRK20_ACTION[]) {
      return withWalletTimeout(account.strk20PrepareInvoke(actions, true), {
        action: "prove the transaction",
      });
    },
    invoke(actions: STRK20_ACTION[]): Promise<InvokeResult> {
      return withWalletTimeout(account.strk20InvokeTransaction(actions), {
        action: "submit the transaction",
      });
    },
  };
}
