import { ActivityList } from "@/components/activity/activity-list";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "Activity · Almoner" };

export default function ActivityPage() {
  return (
    <>
      <PageHeader
        title="Activity"
        description="Payments sent from this browser, with a link to each transaction on-chain."
      />
      <ActivityList />
    </>
  );
}
