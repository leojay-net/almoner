/**
 * Keeper configuration, entirely from the environment.
 *
 * The keeper account's private key is an ordinary Starknet key controlling an
 * ordinary account. It signs public `refund` transactions and nothing else — it
 * never touches a viewing key, holds no shielded balance, and cannot move funds
 * anywhere except the refund address fixed when each allocation was created.
 * Compromising it costs gas, not user money.
 */
export interface KeeperConfig {
  readonly rpcUrl: string;
  readonly escrowAddress: string;
  readonly accountAddress: string;
  readonly privateKey: string;
  readonly fromBlock: number;
  readonly statePath: string;
  readonly intervalMs: number;
  readonly graceSeconds: bigint;
  readonly batchSize: number;
  readonly dryRun: boolean;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`missing required environment variable ${name}`);
  }
  return value.trim();
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number, got "${raw}"`);
  return value;
}

export function loadConfig(argv: readonly string[] = process.argv): KeeperConfig {
  const dryRun = argv.includes("--dry-run");
  return {
    rpcUrl: required("STARKNET_RPC_URL"),
    escrowAddress: required("ESCROW_ADDRESS"),
    // A dry run never signs, so it needs no key.
    accountAddress: dryRun ? (process.env.KEEPER_ACCOUNT_ADDRESS ?? "0x0") : required("KEEPER_ACCOUNT_ADDRESS"),
    privateKey: dryRun ? (process.env.KEEPER_PRIVATE_KEY ?? "0x0") : required("KEEPER_PRIVATE_KEY"),
    fromBlock: optionalNumber("ESCROW_FROM_BLOCK", 0),
    statePath: process.env.KEEPER_STATE_PATH ?? ".keeper/state.json",
    intervalMs: optionalNumber("KEEPER_INTERVAL_MS", 60_000),
    graceSeconds: BigInt(optionalNumber("KEEPER_GRACE_SECONDS", 120)),
    batchSize: optionalNumber("KEEPER_BATCH_SIZE", 25),
    dryRun,
  };
}
