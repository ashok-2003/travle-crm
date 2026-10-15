// A section of the organization's page: its heading, an action beside it, and labelled values in a divided list
// (DESIGN.md: hairlines before cards; labels muted, values in ink; a missing value said, never blank; detail panels
// 720px wide, lists and tables the page's width).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Detail {
  label: string;
  value: ReactNode;
}

export function DetailSection({
  id,
  heading,
  action,
  wide = false,
  children,
}: {
  id: string;
  heading: string;
  action?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn("flex flex-col gap-3", !wide && "max-w-[720px]")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="text-section font-semibold">
          {heading}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DetailList({ details }: { details: Detail[] }) {
  return (
    <dl className="divide-y rounded-lg border">
      {details.map((detail) => (
        <div key={detail.label} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3">
          <dt className="w-44 text-label text-muted-foreground">{detail.label}</dt>
          <dd className="min-w-0 flex-1 break-words script-leading">{detail.value}</dd>
        </div>
      ))}
    </dl>
  );
}
