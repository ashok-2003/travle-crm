"use client";

// What a list shows while it loads (DESIGN.md section 6: skeletons, after 200ms so a quick load never flashes them):
// rows of skeleton in the list's shape, one line or two, and one status that says, to a screen reader, what loads.
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { Delayed } from "./delayed";

export function LoadingRows({
  rows = 4,
  shape = "line",
  label,
}: {
  rows?: number;
  /** One line a row (a name), or two (a title and a line under it). */
  shape?: "line" | "twoLines";
  /** What loads, for screen readers; by default "Loading". */
  label?: string;
}) {
  const t = useTranslations("common");
  return (
    <Delayed>
      <div role="status" aria-busy="true" aria-label={label ?? t("loading")} className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, row) => (
          <Skeleton key={row} className={shape === "line" ? "h-14 w-full" : "h-20 w-full"} />
        ))}
      </div>
    </Delayed>
  );
}
