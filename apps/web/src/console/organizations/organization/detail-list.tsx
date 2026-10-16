// A section of the organization's page: its heading, an action beside it, and labelled values (components/details.tsx)
// (DESIGN.md: hairlines before cards; labels muted, values in ink; a missing value said, never blank; detail panels
// 720px wide, lists and tables the page's width).
import type { ReactNode } from "react";
import { Details } from "@/components/details";
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
    <Details
      rows={details.map(({ label, value }) => ({ label, value: <span className="script-leading">{value}</span> }))}
    />
  );
}
