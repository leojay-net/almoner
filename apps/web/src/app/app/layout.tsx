import type { ReactNode } from "react";

import { ConnectButton } from "@/components/shell/connect-button";
import { MobileNav, Sidebar } from "@/components/shell/nav";
import { PageTransition } from "@/components/shell/page-transition";
import { WalletProvider } from "@/lib/wallet-context";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <div className="min-h-screen bg-canvas">
        <Sidebar />
        <MobileNav />
        <div className="lg:pl-[264px]">
          <header className="sticky top-0 z-30 hidden h-16 items-center justify-end border-b border-line bg-canvas/80 px-8 backdrop-blur-xl lg:flex">
            <ConnectButton />
          </header>
          <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 lg:py-12">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
    </WalletProvider>
  );
}
