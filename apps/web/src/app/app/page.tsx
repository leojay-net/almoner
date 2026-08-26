import Link from "next/link";

import { ArrowRight, Inbox, Send, Shield as ShieldIcon } from "@/components/icons";
import { RevealGroup, RevealItem } from "@/components/motion/primitives";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { CHAIN_ID, POOL_FEE_FRI } from "@/lib/chain";
import { ESCROW_ADDRESS } from "@/lib/escrow";
import { formatUnits, shortenFelt } from "@/lib/format";

export const metadata = { title: "Overview · Almoner" };

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description="Pay many people from one shielded balance for a single flat fee, including people who have never used a wallet."
      />

      <RevealGroup className="grid gap-4 sm:grid-cols-3" gap={0.06}>
        <RevealItem>
          <Stat
            label="Pool fee"
            value={`${formatUnits(POOL_FEE_FRI)} STRK`}
            note="per transaction, not per payment"
          />
        </RevealItem>
        <RevealItem>
          <Stat
            label="Network"
            value={CHAIN_ID === "SN_MAIN" ? "Starknet mainnet" : "Starknet Sepolia"}
            note={CHAIN_ID}
          />
        </RevealItem>
        <RevealItem>
          <Stat
            label="Escrow"
            value={ESCROW_ADDRESS === "" ? "Not deployed" : shortenFelt(ESCROW_ADDRESS, 8, 6)}
            note={ESCROW_ADDRESS === "" ? "claims unavailable until it is" : "live"}
            tone={ESCROW_ADDRESS === "" ? "caution" : undefined}
          />
        </RevealItem>
      </RevealGroup>

      <RevealGroup className="mt-5 grid gap-4 md:grid-cols-3" gap={0.06}>
        {ACTIONS.map((action) => (
          <RevealItem key={action.href}>
            <Link href={action.href} className="block h-full">
              <Card interactive className="group h-full p-6">
                <action.icon className="size-6 text-accent" />
                <h2 className="mt-5 flex items-center gap-2 text-lg font-semibold tracking-tight">
                  {action.title}
                  <ArrowRight className="size-4 text-text-muted transition-transform duration-200 group-hover:translate-x-1" />
                </h2>
                <p className="mt-2.5 text-sm leading-relaxed text-text-secondary">{action.body}</p>
              </Card>
            </Link>
          </RevealItem>
        ))}
      </RevealGroup>
    </>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "caution";
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-muted">{label}</p>
        {tone === "caution" ? <Pill tone="caution">Pending</Pill> : null}
      </div>
      <p className="tabular mt-3 text-xl font-semibold">{value}</p>
      <p className="mt-1.5 text-xs text-text-muted">{note}</p>
    </Card>
  );
}

const ACTIONS = [
  {
    href: "/app/shield",
    icon: ShieldIcon,
    title: "Shield first",
    body: "Move STRK into the pool. This registers you and creates the balance a batch is paid from — nothing else works until it is done.",
  },
  {
    href: "/app/pay",
    icon: Send,
    title: "Pay a batch",
    body: "Paste a recipient list, review the split, and fund every payment in one signature.",
  },
  {
    href: "/app/claim",
    icon: Inbox,
    title: "Claim a payment",
    body: "Redeem a claim link into a shielded balance only you can read.",
  },
] as const;
