"use client";

// A card of Home's day (spec 5): its title, and View all in the corner when there is more to open.
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { TextLink } from "@/components/text-link";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
            <TextLink href={viewAll}>{t("viewAll")}</TextLink>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}
