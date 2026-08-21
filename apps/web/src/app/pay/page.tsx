import Link from "next/link";

import { PayerPanel } from "@/components/payer-panel";

export const metadata = {
  title: "Pay a batch · Almoner",
  description: "Pay many recipients privately from a shielded balance in one transaction.",
};

export default function PayPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Pay a batch</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          One transaction, one flat pool fee, any number of recipients — including people who
          have never used STRK20.
        </p>
      </header>

      <section className="mt-10">
        <PayerPanel />
      </section>

      <footer className="mt-16 border-t border-neutral-200 pt-6 text-xs text-neutral-500 dark:border-neutral-800">
        <p>
          Recipients already registered with the pool receive a private note directly. Everyone
          else is escrowed behind a claim link, because only a recipient can register their own
          viewing key.
        </p>
        <p className="mt-2">
          Amounts leaving your shielded balance are private. The escrow leg is a public
          withdrawal, so the total moved to the escrow contract is visible on-chain — the split
          between recipients is not.
        </p>
        <p className="mt-2">
          <Link href="/" className="underline underline-offset-2">
            What is Almoner?
          </Link>
        </p>
      </footer>
    </main>
  );
}
