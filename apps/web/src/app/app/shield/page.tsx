import { PageHeader } from "@/components/shell/page-header";
import { ShieldPanel } from "@/components/shield-panel";

export const metadata = { title: "Shield · Almoner" };

export default function ShieldPage() {
  return (
    <>
      <PageHeader
        title="Shield"
        description="Move public STRK into the pool. A batch is paid from your shielded balance, so this comes first. Shielding itself is public - the depositing address and amount are visible on-chain. What happens afterwards is not."
      />
      <ShieldPanel />
    </>
  );
}
