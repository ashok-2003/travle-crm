// A key figure in a quiet strip, divided by hairlines (DESIGN.md): its label with its info hint, and its mono value; no icon,
// no colour for a normal count. Home's strip is made of these: side by side from a tablet up, and on a phone two to a row
// with a wide figure (money, up to crores) taking a row of its own, so no amount is ever clipped.
import { InfoHint } from "@/components/info-hint";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface Figure {
  key: string;
  value: string;
  hint: string;
  /** A figure that needs the room: on a phone it takes a whole row, under a hairline. */
  wide?: boolean;
}

/** One figure of a row of `count`, with a hairline after it unless it is the last. */
export function FigureCell({
  figure,
  label,
  index,
  count,
  wideNext = false,
}: {
  figure: Figure;
  label: string;
  index: number;
  count: number;
  /** The next figure takes a row of its own on a phone: no hairline beside this one there. */
  wideNext?: boolean;
}) {
  const wide = figure.wide === true;
  return (
    <div role="group" aria-label={label} className={cn("flex flex-col", wide && "col-span-2 md:col-span-1")}>
      {wide && <Separator className="md:hidden" />}
      <div className="flex flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
          <span className="flex items-center gap-1 text-label text-muted-foreground">
            {label}
            <InfoHint term={label}>{figure.hint}</InfoHint>
          </span>
          <p className="font-mono text-number-lg font-medium tabular-nums">{figure.value}</p>
        </div>
        {index < count - 1 && <Separator orientation="vertical" className={cn(wideNext && "hidden md:block")} />}
      </div>
    </div>
  );
}
