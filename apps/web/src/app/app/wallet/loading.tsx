import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while this route's segment streams in. It mirrors the real layout —
 * header, then the wallet cards — so the page settles into place instead of
 * appearing all at once after a blank pause.
 */
export default function Loading() {
  return (
    <>
      <PageHeader
        title="Wallet"
        description="STRK20 actions are executed by your wallet, which holds the viewing key and generates the proof. This asks which Wallet API versions each wallet speaks — metadata only, so it prompts nobody and never reads your balances."
      />
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <Card key={i} className="space-y-3 px-6 py-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </Card>
        ))}
      </div>
    </>
  );
}
