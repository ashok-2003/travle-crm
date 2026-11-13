"use client";

// One part of a booking's page (release 6) as the registry Card: a heading the card is named by, and its content. A region
// of the page, so a screen reader and the journeys find it by its name.
import { useId, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** `anchor`: where a link elsewhere (a switch that says what to add first) lands on the page. */
export function SectionCard({ title, anchor, children }: { title: string; anchor?: string; children: ReactNode }) {
  const id = useId();
  return (
    <Card id={anchor} role="region" aria-labelledby={id} className="scroll-mt-6">
      <CardHeader>
        <CardTitle>
          <h2 id={id}>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}
