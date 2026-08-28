import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while this route's segment streams in. It mirrors the real layout —
 * header, then a list of rows — so the page settles into place instead of
 * appearing all at once after a blank pause.
 */
export default function Loading() {
  return (
    <>
      <PageHeader
        title="Activity"
        description="Payments sent from this browser, with a link to each transaction on-chain."
      />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="flex items-center justify-between gap-4 px-6 py-5">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-4 w-28" />
          </Card>
        ))}
      </div>
    </>
  );
}
