import Link from "next/link";

import { Activity, ArrowRight } from "@/components/icons";
import { Reveal } from "@/components/motion/primitives";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { ESCROW_ADDRESS } from "@/lib/escrow";

export const metadata = { title: "Activity · Almoner" };

export default function ActivityPage() {
  const deployed = ESCROW_ADDRESS !== "";

  return (
    <>
      <PageHeader
        title="Activity"
        description="Every batch you have funded, and the state of each allocation inside it."
      />

      <Reveal>
        <Card className="px-8 py-16 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-line bg-surface-raised">
            <Activity className="size-6 text-text-muted" />
          </div>
          <h2 className="mt-6 text-lg font-semibold">
            {deployed ? "No batches yet" : "Nothing to show yet"}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-text-secondary">
            {deployed ? (
              <>
                Activity is read from the escrow contract on-chain. Fund your first batch and it
                will appear here within a block.
              </>
            ) : (
              <>
                The escrow contract is not deployed yet, so there is no on-chain history to read.
                This page reads allocations directly from the contract rather than from a database,
                which means it stays correct even if this app is not the one that funded them.
              </>
            )}
          </p>
          <div className="mt-8">
            <Link
              href="/app/pay"
              className="inline-flex items-center gap-2 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
            >
              Pay a batch
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </Card>
      </Reveal>
    </>
  );
}
