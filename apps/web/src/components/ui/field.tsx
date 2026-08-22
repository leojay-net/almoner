"use client";

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useId } from "react";

const control =
  "w-full rounded-xl border border-line bg-surface-raised px-3.5 py-2.5 text-text-primary " +
  "placeholder:text-text-muted transition-colors duration-150 " +
  "hover:border-line-strong focus:border-accent focus:outline-none " +
  "focus:ring-4 focus:ring-accent-wash";

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
}

function FieldShell({ label, hint, children }: FieldShellProps) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-text-primary">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="text-xs leading-relaxed text-text-muted">{hint}</p> : null}
    </div>
  );
}

export function TextField({
  label,
  hint,
  mono,
  ...props
}: { label: string; hint?: ReactNode; mono?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell label={label} hint={hint}>
      {(id) => (
        <input
          id={id}
          className={`${control} ${mono ? "font-mono text-xs" : "text-sm"}`}
          {...props}
        />
      )}
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  hint,
  ...props
}: { label: string; hint?: ReactNode } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell label={label} hint={hint}>
      {(id) => (
        <textarea
          id={id}
          spellCheck={false}
          className={`${control} font-mono text-xs`}
          {...props}
        />
      )}
    </FieldShell>
  );
}
