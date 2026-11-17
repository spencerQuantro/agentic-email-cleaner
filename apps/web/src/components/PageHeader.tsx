import type { ReactNode } from "react";

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
}: {
  title: string;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-[13px] text-muted">{eyebrow}</p>}
        <h1 className="font-display text-[32px] leading-tight font-semibold">{title}</h1>
        {description && <p className="mt-1.5 max-w-[620px] text-muted">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
