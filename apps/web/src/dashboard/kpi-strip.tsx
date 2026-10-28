// A key figure in a quiet strip, divided by hairlines (DESIGN.md): its label with its info hint, and its mono value; no icon,
// no colour for a normal count. Home's strip of three is made of these, side by side at every width.
import { InfoHint } from "@/components/info-hint";
import { Separator } from "@/components/ui/separator";

export interface Figure {
  key: string;
  value: string;
  hint: string;
}

/** One figure of a row of `count`, with a hairline after it unless it is the last. */
export function FigureCell({
  figure,
  label,
  index,
  count,
}: {
  figure: Figure;
  label: string;
  index: number;
  count: number;
}) {
  return (
    <div role="group" aria-label={label} className="flex">
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
        <span className="flex items-center gap-1 text-label text-muted-foreground">
          {label}
          <InfoHint term={label}>{figure.hint}</InfoHint>
        </span>
        <p className="font-mono text-number-lg font-medium tabular-nums">{figure.value}</p>
      </div>
      {index < count - 1 && <Separator orientation="vertical" />}
    </div>
  );
}
