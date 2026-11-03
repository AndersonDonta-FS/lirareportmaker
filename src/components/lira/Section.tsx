import type { ReactNode } from "react";

export function Section({
  step,
  title,
  description,
  children,
  aside,
}: {
  step: number;
  title: string;
  description?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="sheet p-5 sm:p-6">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="step-badge mt-0.5">{step}</span>
          <div>
            <h2 className="text-lg font-bold text-foreground">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function StatusPill({ tone, children }: { tone: "positive" | "negative" | "caution" | "muted"; children: ReactNode }) {
  const tones = {
    positive: "bg-positive-soft text-positive",
    negative: "bg-negative-soft text-negative",
    caution: "bg-caution-soft text-caution",
    muted: "bg-muted text-muted-foreground",
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
  );
}
