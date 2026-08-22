import { PageHeader } from "@/components/shell/page-header";
import { WalletCapabilityPanel } from "@/components/wallet-capability";

export const metadata = { title: "Wallet · Almoner" };

export default function WalletPage() {
  return (
    <>
      <PageHeader
        title="Wallet"
        description="STRK20 actions are executed by your wallet, which holds the viewing key and generates the proof. This asks which Wallet API versions each wallet speaks — metadata only, so it prompts nobody and never reads your balances."
      />
      <WalletCapabilityPanel />
    </>
  );
}
