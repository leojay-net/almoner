import Link from "next/link";

import { FeeComparison } from "@/components/landing/fee-comparison";
import { ArrowRight, Clock, Logo, Send, Shield } from "@/components/icons";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo className="size-6 text-accent" />
            <span className="font-semibold tracking-tight">Almoner</span>
          </Link>
          <ButtonLink href="/app" size="sm">
            Open app
            <ArrowRight className="size-4" />
          </ButtonLink>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div aria-hidden className="grid-backdrop pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-5 pt-24 pb-20 sm:px-8 lg:pt-32 lg:pb-28">
          <RevealGroup className="max-w-4xl" gap={0.07}>
            <RevealItem>
              <p className="text-sm font-medium tracking-wide text-accent uppercase">
                Private batch disbursement
              </p>
            </RevealItem>
            <RevealItem>
              <h1 className="mt-5 text-display font-semibold text-balance">
                Pay everyone at once. Reveal nothing.
              </h1>
            </RevealItem>
            <RevealItem>
              <p className="mt-7 max-w-2xl text-lead text-text-secondary">
                Almoner pays hundreds of people from one shielded balance for a single flat fee —
                including people who have never held a wallet. Salaries stay unlinked. Payroll stops
                being a public document.
              </p>
            </RevealItem>
            <RevealItem>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <ButtonLink href="/app" size="lg">
                  Pay a batch
                  <ArrowRight className="size-[18px]" />
                </ButtonLink>
                <ButtonLink href="/app" size="lg" variant="secondary">
                  Explore the app
                </ButtonLink>
              </div>
            </RevealItem>
          </RevealGroup>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <Reveal>
          <div className="mb-10 max-w-2xl">
            <h2 className="text-title font-semibold text-balance">
              The fee is charged per transaction, not per payment.
            </h2>
            <p className="mt-5 text-lead text-text-secondary">
              Almost everything else about this product follows from that one fact. Drag the slider.
            </p>
          </div>
        </Reveal>
        <Reveal delay={0.05}>
          <FeeComparison />
        </Reveal>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <Reveal>
          <h2 className="max-w-2xl text-title font-semibold text-balance">
            Three steps, and only one of them needs you.
          </h2>
        </Reveal>
        <RevealGroup className="mt-12 grid gap-5 md:grid-cols-3" gap={0.08}>
          {STEPS.map((step, index) => (
            <RevealItem key={step.title}>
              <Card interactive className="h-full p-7">
                <div className="flex items-center justify-between">
                  <step.icon className="size-6 text-accent" />
                  <span className="tabular text-sm text-text-muted">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-6 text-xl font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">{step.body}</p>
              </Card>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <Reveal>
          <div className="rounded-panel border border-line bg-surface p-7 sm:p-10">
            <h2 className="text-heading font-semibold">What is hidden, and what is not</h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-text-secondary">
              Two routes with different properties. Saying otherwise would be the easiest way to
              mislead you, so here they are separately.
            </p>

            <div className="mt-9 grid gap-4 sm:grid-cols-2">
              {DISCLOSURE.map((row) => (
                <div key={row.route} className="rounded-card border border-line p-6">
                  <p className="text-sm font-semibold">{row.route}</p>
                  <dl className="mt-5 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-text-muted">Amount</dt>
                      <dd className={row.amountHidden ? "text-positive" : "text-caution"}>
                        {row.amountHidden ? "Hidden" : "Public"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-text-muted">Recipient</dt>
                      <dd className="text-positive">Hidden</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>

            <p className="mt-7 text-sm leading-relaxed text-text-secondary">
              Almoner claims identity privacy, never amount privacy. Funding an escrowed allocation
              publishes its amount on-chain against a commitment hash — what stays hidden is who it
              is for.
            </p>
          </div>
        </Reveal>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-28 sm:px-8">
        <Reveal>
          <div className="rounded-panel border border-line bg-surface px-7 py-14 text-center sm:px-10">
            <h2 className="mx-auto max-w-2xl text-title font-semibold text-balance">
              Run payroll without publishing it.
            </h2>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/app" size="lg">
                Pay a batch
                <ArrowRight className="size-[18px]" />
              </ButtonLink>
              <ButtonLink href="/app/claim" size="lg" variant="secondary">
                Claim a payment
              </ButtonLink>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-text-muted sm:px-8">
          <div className="flex items-center gap-2.5">
            <Logo className="size-5" />
            <span>Almoner</span>
          </div>
          <p>In development and unaudited. Do not move money you cannot afford to lose.</p>
        </div>
      </footer>
    </div>
  );
}

const STEPS = [
  {
    icon: Send,
    title: "Fund once",
    body: "Sign a single transaction that pays every recipient in the batch. Registered wallets receive a private note; everyone else is escrowed behind a claim link.",
  },
  {
    icon: Shield,
    title: "They claim",
    body: "A recipient opens their link, connects any wallet, and the payment lands as a balance only they can read. No account needed beforehand.",
  },
  {
    icon: Clock,
    title: "It settles itself",
    body: "Unclaimed payments return to you when the window closes. That sweep runs unattended, with nobody signing anything.",
  },
] as const;

const DISCLOSURE = [
  { route: "Direct note to a registered wallet", amountHidden: true },
  { route: "Escrowed claim link", amountHidden: false },
] as const;
