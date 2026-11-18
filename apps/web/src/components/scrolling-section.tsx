"use client";

// A section of a busy screen (My tasks, Follow-ups): a card with its heading and count. On a wide screen the body is a
// fixed-height scroll area (about five compact rows), so a long section never pushes the next one down; on a phone a
// scroll box inside the page's own scroll traps the thumb, so the section is a collapsible instead.
import { ChevronDownIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCount } from "@/lib/format";
import { useWideScreen } from "@/lib/use-wide-screen";

export function ScrollingSection({
  title,
  count,
  defaultOpen,
  children,
  footer,
}: {
  title: string;
  /** Left off when the section has no number of its own to show. */
  count?: number | undefined;
  /** On a phone: whether it starts open (the page opens only its first section with something in it). */
  defaultOpen: boolean;
  children: ReactNode;
  /** Under the rows, outside the scroll on a wide screen. */
  footer?: ReactNode | undefined;
}) {
  const wide = useWideScreen();
  const countId = useId();
  const shownCount =
    count === undefined ? null : (
      <span id={countId} className="numbers text-label text-muted-foreground">
        {formatCount(count)}
      </span>
    );

  if (wide) {
    return (
      <Card role="region" aria-label={title} className="gap-2">
        <div className="flex items-baseline justify-between gap-3 px-4">
          <h2 className="text-section font-semibold">{title}</h2>
          {shownCount}
        </div>
        <ScrollArea className="h-90">
          <div className="flex flex-col gap-2 px-2">{children}</div>
        </ScrollArea>
        {footer !== undefined && <div className="px-4">{footer}</div>}
      </Card>
    );
  }
  return (
    <Card role="region" aria-label={title} className="gap-0 py-0">
      <Collapsible defaultOpen={defaultOpen}>
        <h2 className="text-section font-semibold">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              aria-label={title}
              aria-describedby={shownCount === null ? undefined : countId}
              className="min-h-11 w-full justify-between px-4 text-section font-semibold"
            >
              {title}
              <span className="flex items-center gap-2">
                {shownCount}
                <ChevronDownIcon aria-hidden="true" />
              </span>
            </Button>
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent className="flex flex-col gap-2 px-2 pb-3">
          {children}
          {footer !== undefined && <div className="px-2">{footer}</div>}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
