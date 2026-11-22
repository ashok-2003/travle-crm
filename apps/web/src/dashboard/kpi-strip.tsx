// A key figure in a quiet strip, divided by hairlines (DESIGN.md): its label with its info hint, and its mono value; no icon,
// no colour for a normal count. Side by side from a tablet up, and on a phone two to a row with a wide figure (money, up
// to crores) taking a row of its own, so no amount is ever clipped. A figure with a list that holds exactly what it
// counts (the AI agent's Chats answered) is a way into it: a hover in its card's own tint, an arrow after its
// value, and its words a link stretched over the cell, named by the number and where it leads, whose focus outline goes
// round the cell (globals.css). The ⓘ stays a button of its own beside the words, never under the link.
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { InfoHint } from "@/components/info-hint";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface Figure {
  key: string;
  value: string;
  hint: string;
  /** A figure that needs the room: on a phone it takes a whole row, under a hairline. */
  wide?: boolean;
  /** The list behind the number, and the link's name ("Chats answered: 12, in the Inbox"). */
  link?: { href: string; name: string };
}

/** One figure of a row of `count`, with a hairline after it unless it is the last. */
export function FigureCell({
  figure,
  label,
  index,
  count,
  wideNext = false,
  valueClassName,
  hoverClassName = "hover:bg-muted",
}: {
  figure: Figure;
  label: string;
  index: number;
  count: number;
  /** On a phone this figure ends its row (the next takes a row of its own, or the strip wraps here): no hairline beside it there. */
  wideNext?: boolean;
  /** The value's colour on a tinted card (its tint's dark ink). */
  valueClassName?: string;
  /** A figure with a link: its cell under the pointer, in its card's tint (the muted surface on a plain card). */
  hoverClassName?: string;
}) {
  const wide = figure.wide === true;
  const { link } = figure;
  return (
    <div role="group" aria-label={label} className={cn("flex flex-col", wide && "col-span-2 md:col-span-1")}>
      {wide && <Separator className="md:hidden" />}
      <div className="flex flex-1">
        <div
          data-figure-link={link === undefined ? undefined : ""}
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-1 p-4",
            link !== undefined && cn("relative motion-safe:transition-colors", hoverClassName),
          )}
        >
          <span className="flex items-center gap-1 text-label text-muted-foreground">
            {link === undefined ? (
              label
            ) : (
              // Its ::after takes the pointer anywhere on the cell; the ⓘ, later and positioned, stays above it.
              <Link
                href={link.href}
                aria-label={link.name}
                className="underline-offset-4 after:absolute after:inset-0 hover:underline"
              >
                {label}
              </Link>
            )}
            <InfoHint term={label}>{figure.hint}</InfoHint>
          </span>
          <p
            className={cn("flex items-center gap-2 font-mono text-number-lg font-medium tabular-nums", valueClassName)}
          >
            {figure.value}
            {link !== undefined && <ArrowRightIcon aria-hidden="true" className="size-5" />}
          </p>
        </div>
        {index < count - 1 && <Separator orientation="vertical" className={cn(wideNext && "hidden md:block")} />}
      </div>
    </div>
  );
}
