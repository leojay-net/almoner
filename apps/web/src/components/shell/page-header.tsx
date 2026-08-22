import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-10 flex flex-wrap items-start justify-between gap-5">
      <div className="max-w-2xl">
        <h1 className="text-heading font-semibold text-balance">{title}</h1>
        {description ? (
          <p className="mt-3 leading-relaxed text-text-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </header>
  );
}
