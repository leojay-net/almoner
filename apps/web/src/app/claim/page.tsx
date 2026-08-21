import Link from "next/link";

import { ClaimPanel } from "@/components/claim-panel";

export const metadata = {
  title: "Claim · Almoner",
  description: "Claim a private payment into your own shielded balance.",
};

export default function ClaimPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Claim your payment</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Someone sent you money privately. Connect a wallet to move it into a balance only you
          can see.
        </p>
      </header>

      <section className="mt-10">
        <ClaimPanel />
      </section>

      <footer className="mt-16 border-t border-neutral-200 pt-6 text-xs text-neutral-500 dark:border-neutral-800">
        <p>
          <strong className="font-medium">The secret in your link is a bearer token.</strong>{" "}
          Anyone who has it can claim this payment. It sits after the <code>#</code> in the URL,
          which browsers never send to a server — so it stays between you and this page. Do not
          forward the link once you have claimed.
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
