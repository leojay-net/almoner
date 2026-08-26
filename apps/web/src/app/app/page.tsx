import { PageHeader } from "@/components/shell/page-header";
import { SendFlow } from "@/components/send/send-flow";

export const metadata = { title: "Send · Almoner" };

export default function SendPage() {
  return (
    <>
      <PageHeader
        title="Send a private payment"
        description="Pay one person or five hundred in a single transaction, for a single flat fee — including people who have never held a wallet."
      />
      <SendFlow />
    </>
  );
}
