import type { ReactNode } from "react";

import { MobileNav, Sidebar } from "@/components/shell/nav";
import { PageTransition } from "@/components/shell/page-transition";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar />
      <MobileNav />
      <div className="lg:pl-[264px]">
        <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 lg:py-14">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
