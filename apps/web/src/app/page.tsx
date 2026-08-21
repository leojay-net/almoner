import { WalletCapabilityPanel } from "@/components/wallet-capability";
import { POOL_ADDRESS, VOYAGER_POOL_URL } from "@/lib/chain";

export default function Home() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Almoner</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Private batch disbursement on STRK20. Pay many people from a shielded balance for one
          flat pool fee — including people who have never registered with the pool.
        </p>
      </header>

      <section className="mt-12">
        <h2 className="text-lg font-medium">Wallet check</h2>
        <p className="mt-1 mb-6 text-sm text-neutral-600 dark:text-neutral-400">
          STRK20 actions are executed by your wallet, which holds the viewing key and generates
          the proof. This asks which Wallet API versions each wallet speaks — metadata only, so
          it prompts nobody and never reads your balances.
        </p>
        <WalletCapabilityPanel />
      </section>

      <footer className="mt-16 border-t border-neutral-200 pt-6 text-xs text-neutral-500 dark:border-neutral-800">
        <p>
          Pool{" "}
          <a href={VOYAGER_POOL_URL} className="underline underline-offset-2" rel="noreferrer">
            <code className="break-all">{POOL_ADDRESS}</code>
          </a>{" "}
          on Starknet mainnet.
        </p>
        <p className="mt-2">
          In development and unaudited. Deposits and withdrawals are public ERC-20 legs — the
          address, token and amount are visible on-chain. What stays private is the distribution
          inside the pool.
        </p>
      </footer>
    </main>
  );
}
