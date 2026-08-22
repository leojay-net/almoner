import Link from "next/link";

import { ClaimPanel } from "@/components/claim-panel";
import { Logo } from "@/components/icons";
import { Reveal } from "@/components/motion/primitives";

export const metadata = {
  title: "Claim your payment · Almoner",
  description: "Claim a private payment into your own shielded balance.",
};

/**
 * Public claim page.
 *
 * Deliberately outside the app shell: a recipient arriving from a link is not a
 * user of this product and may never be. No sidebar, no navigation, one task.
 */
export default function ClaimPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-2xl items-center px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo className="size-6 text-accent" />
            <span className="font-semibold tracking-tight">Almoner</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-16 sm:px-8">
        <Reveal>
          <h1 className="text-title font-semibold text-balance">You have been paid privately.</h1>
          <p className="mt-5 text-lead text-text-secondary">
            Connect a wallet to move this into a balance only you can read.
          </p>
        </Reveal>

        <Reveal delay={0.06} className="mt-12">
          <ClaimPanel />
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-14 border-t border-line pt-7 text-sm leading-relaxed text-text-muted">
            <p>
              <span className="font-medium text-text-secondary">
                The secret in your link is a bearer token.
              </span>{" "}
              Anyone holding it can claim this payment. It sits after the <code>#</code> in the URL,
              which browsers never send to a server, so it stays between you and this page. Do not
              forward the link once you have claimed.
            </p>
          </div>
        </Reveal>
      </main>
    </div>
  );
}
