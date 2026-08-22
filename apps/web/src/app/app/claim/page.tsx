import { PageHeader } from "@/components/shell/page-header";
import { ClaimPanel } from "@/components/claim-panel";

export const metadata = { title: "Claim · Almoner" };

export default function AppClaimPage() {
  return (
    <>
      <PageHeader
        title="Claim a payment"
        description="Open a claim link to redeem it. The secret travels in the part of the URL after the hash, which browsers never send to a server."
      />
      <ClaimPanel />
    </>
  );
}
