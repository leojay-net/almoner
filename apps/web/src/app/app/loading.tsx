import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while this route's segment streams in. It mirrors the real layout —
 * header, then the compose card — so the page settles into place instead of
 * appearing all at once after a blank pause.
 */
export default function Loading() {
  return (
    <>
      <PageHeader
        title="Send a private payment"
        description="Pay one person or five hundred in a single transaction, for a single flat fee — including people who have never used the pool before."
      />
      <div className="space-y-3">
        <Card className="space-y-4 px-6 py-6">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-9 w-56" />
        </Card>
        <Card className="space-y-4 px-6 py-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-11 w-40" />
        </Card>
      </div>
    </>
  );
}
