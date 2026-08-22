import { PageHeader } from "@/components/shell/page-header";
import { PayerPanel } from "@/components/payer-panel";

export const metadata = { title: "Pay a batch · Almoner" };

export default function PayPage() {
  return (
    <>
      <PageHeader
        title="Pay a batch"
        description="One transaction, one flat pool fee, any number of recipients. Registered wallets receive a private note directly; everyone else is escrowed behind a claim link, because only a recipient can register their own viewing key."
      />
      <PayerPanel />
    </>
  );
}
