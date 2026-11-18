"use client";

// A card of Home's day (spec 5): its title, and View all in the corner when there is more to open.
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { ForwardLink } from "@/components/text-link";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** A row of Home's lists (spec 5), one compact line from tablets up: name, then what to do in muted text. At least 44px. */
export const rowClasses = {
  // The group's own gap and the separator's margin added up to 36px around every line; rows touch their hairline.
  group: "gap-0 has-data-[size=sm]:gap-0",
  separator: "my-0",
  item: "py-1.5",
  content: "min-w-0 gap-0 md:flex-row md:items-center md:gap-3",
  about: "min-w-0 break-words md:truncate",
};

export function HomeCard({ title, viewAll, children }: { title: string; viewAll?: string; children: ReactNode }) {
  const t = useTranslations("home");
  const headingId = useId();
  return (
    <Card role="region" aria-labelledby={headingId}>
      <CardHeader>
        <CardTitle>
          <h2 id={headingId}>{title}</h2>
        </CardTitle>
        {viewAll !== undefined && (
          <CardAction>
            <ForwardLink href={viewAll} label={t("viewAll")} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}
