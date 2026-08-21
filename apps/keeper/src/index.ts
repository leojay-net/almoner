import { createChain } from "./chain.ts";
import { loadConfig } from "./config.ts";
import { runPass, type Logger } from "./sweeper.ts";
import { loadState } from "./store.ts";

const log: Logger = {
  info: (message) => console.log(`${new Date().toISOString()} ${message}`),
  warn: (message) => console.warn(`${new Date().toISOString()} WARN ${message}`),
};

async function main(): Promise<void> {
  const config = loadConfig();
  const once = process.argv.includes("--once");

  log.info(
    `keeper starting - escrow ${config.escrowAddress}${config.dryRun ? " [dry run]" : ""}`,
  );

  const chain = createChain(config);
  const state = await loadState(config.statePath, config.fromBlock);
  log.info(`resuming from block ${state.cursorBlock + 1}, ${state.allocations.size} tracked`);

  let stopping = false;
  const stop = () => {
    if (stopping) process.exit(1);
    stopping = true;
    log.info("shutting down after this pass");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  for (;;) {
    try {
      const result = await runPass(chain, state, config, log);
      const { funded, claimed, refunded, outstanding } = result.summary;
      log.info(
        `block ${result.scannedTo} | funded ${funded} claimed ${claimed} refunded ${refunded} ` +
          `| outstanding ${outstanding} | swept ${result.swept.length} skipped ${result.skipped}`,
      );
    } catch (error) {
      // A transient RPC failure must not kill an unattended process.
      log.warn(`pass failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (once || stopping) break;
    await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
  }

  log.info("stopped");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
