import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while this route's segment streams in. It mirrors the real layout —
 * header, then the claim card — so the page settles into place instead of
 * appearing all at once after a blank pause.
 */
export default function Loading() {
  return (
    <>
      <PageHeader
        title="Claim a payment"
        description="Open a claim link to redeem it. The secret travels in the part of the URL after the hash, which browsers never send to a server."
      />
      <div className="space-y-3">
        <Card className="space-y-4 px-6 py-6">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-32" />
        </Card>
      </div>
    </>
  );
}
