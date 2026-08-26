"use client";

import { useCallback, useEffect, useState } from "react";

import { CHAIN_ID } from "./chain";
import { checkRegistration, type RegistrationStatus } from "./registration";
import { useWallet } from "./wallet-context";

export type Readiness =
  /** No wallet connected yet. */
  | "no-wallet"
  /** Connected, but this wallet cannot execute STRK20 actions. */
  | "wallet-unsupported"
  /** Connected, but the wallet is pointed at a different network than the app. */
  | "wrong-network"
  /** Working out whether the account has a pool position. */
  | "checking"
  /** Connected and able to sign, but has never registered — so no balance. */
  | "needs-funding"
  /** Registered with the pool. Able to pay. */
  | "ready";

export interface AccountStatus {
  readiness: Readiness;
  /** What the wallet reports, when it differs from what the app expects. */
  walletChainId: string | null;
  registration: RegistrationStatus | null;
  address: string | null;
  refresh: () => void;
}

/**
 * One answer to "can this account pay right now, and if not, what is missing?"
 *
 * Registration is read from the pool's public `ViewingKeySet` event rather than
 * by asking the wallet for balances: the event costs nothing and prompts nobody,
 * whereas a balance read pops a consent dialog for data the app does not need in
 * order to know whether a position exists.
 */
export function useAccountStatus(): AccountStatus {
  const { connection } = useWallet();
  const [result, setResult] = useState<{ address: string; status: RegistrationStatus } | null>(
    null,
  );
  const [nonce, setNonce] = useState(0);

  const address = connection.status === "connected" ? connection.address : null;

  useEffect(() => {
    if (address === null) return;
    let cancelled = false;
    void checkRegistration(address).then((status) => {
      if (!cancelled) setResult({ address, status });
    });
    return () => {
      cancelled = true;
    };
  }, [address, nonce]);

  // Derived, not stored: a result for a previously connected account must never
  // be read as the current one, and clearing it in the effect would cascade.
  const registration = result !== null && result.address === address ? result.status : null;

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  let readiness: Readiness = "no-wallet";
  if (connection.status === "connected") {
    if (connection.chainId !== "" && connection.chainId !== CHAIN_ID) readiness = "wrong-network";
    else if (!connection.support.supported) readiness = "wallet-unsupported";
    else if (registration === null) readiness = "checking";
    else if (registration === "registered") readiness = "ready";
    else readiness = "needs-funding";
  }

  return {
    readiness,
    walletChainId: connection.status === "connected" ? connection.chainId : null,
    registration,
    address,
    refresh,
  };
}
