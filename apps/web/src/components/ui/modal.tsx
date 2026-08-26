"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Close } from "@/components/icons";
import { subscribeNever } from "@/lib/wallets";

/**
 * Modal primitive.
 *
 * Rendered through a portal to `document.body`, which is not optional here: an
 * ancestor with `backdrop-filter`, `transform` or `filter` becomes the
 * containing block for `position: fixed`, so a modal declared inside the blurred
 * app header centres itself on the header and gets clipped. Portalling puts it
 * back in the viewport's coordinate space regardless of what wraps the trigger.
 *
 * Also handles the things a hand-rolled overlay usually forgets: Escape to
 * close, and locking body scroll so the page behind does not move.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  // document.body does not exist during server render, and setting a "mounted"
  // flag from an effect cascades renders. This reads hydration as what it is:
  // an external condition.
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative max-h-[85vh] w-[min(26rem,100%)] overflow-y-auto rounded-panel border border-line bg-surface p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{title}</h2>
                {description ? (
                  <p className="mt-1 text-sm text-text-secondary">{description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mt-1 -mr-1 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <Close className="size-5" />
              </button>
            </div>
            <div className="mt-6">{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
