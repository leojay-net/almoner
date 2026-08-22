"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  Activity,
  Close,
  Inbox,
  Layers,
  Logo,
  Menu,
  Send,
  Shield,
  Wallet,
} from "@/components/icons";

const ITEMS = [
  { href: "/app", label: "Overview", icon: Layers },
  { href: "/app/shield", label: "Shield", icon: Shield },
  { href: "/app/pay", label: "Pay a batch", icon: Send },
  { href: "/app/claim", label: "Claim", icon: Inbox },
  { href: "/app/activity", label: "Activity", icon: Activity },
  { href: "/app/wallet", label: "Wallet", icon: Wallet },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150"
          >
            {/* One shared element slides between items rather than each fading
                independently — the eye tracks a single object moving. */}
            {active ? (
              <motion.span
                layoutId="nav-active"
                className="absolute inset-0 rounded-xl bg-surface-hover"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            <Icon
              className={`relative size-[18px] shrink-0 transition-colors ${
                active ? "text-accent" : "text-text-muted group-hover:text-text-secondary"
              }`}
            />
            <span
              className={`relative transition-colors ${
                active ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary"
              }`}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/" onClick={onClick} className="flex items-center gap-2.5 px-3">
      <Logo className="size-6 text-accent" />
      <span className="text-[0.9375rem] font-semibold tracking-tight">Almoner</span>
    </Link>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[264px] flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-16 items-center">
        <Brand />
      </div>
      <div className="flex-1 px-3 py-2">
        <NavList />
      </div>
      <div className="px-6 py-5 text-xs leading-relaxed text-text-muted">
        Unaudited, in development. Do not move money you cannot lose.
      </div>
    </aside>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-line bg-canvas/85 px-4 backdrop-blur-xl lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <Menu className="size-5" />
        </button>
      </div>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-line bg-surface lg:hidden"
            >
              <div className="flex h-16 items-center justify-between pr-3">
                <Brand onClick={() => setOpen(false)} />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close navigation"
                  className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-hover"
                >
                  <Close className="size-5" />
                </button>
              </div>
              <div className="flex-1 px-3 py-2">
                <NavList onNavigate={() => setOpen(false)} />
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
