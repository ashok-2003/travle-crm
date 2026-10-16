"use client";

// What a list shows while it loads (DESIGN.md section 6: skeletons, after 200ms so a quick load never flashes them),
// in the list's own shape: rows of one line or two, or a table's header and 44px rows, and one status that says, to a
// screen reader, what loads.
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Delayed } from "./delayed";

export function LoadingRows({
  rows = 4,
  shape = "line",
  columns = 4,
  label,
}: {
  rows?: number;
  /** One line a row (a name), two (a title and a line under it), or a table. */
  shape?: "line" | "twoLines" | "table";
  /** A table's columns. */
  columns?: number;
  /** What loads, for screen readers; by default "Loading". */
  label?: string;
}) {
  const t = useTranslations("common");
  const each = (count: number) => Array.from({ length: count }, (_, index) => index);
  return (
    <Delayed>
      <div role="status" aria-busy="true" aria-label={label ?? t("loading")} className="flex flex-col gap-2">
        {shape === "table" ? (
          <Table>
            <TableHeader>
              <TableRow>
                {each(columns).map((column) => (
                  <TableHead key={column}>
                    <Skeleton className="h-4 w-20" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {each(rows).map((row) => (
                <TableRow key={row}>
                  {each(columns).map((column) => (
                    <TableCell key={column}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          each(rows).map((row) => <Skeleton key={row} className={shape === "line" ? "h-14 w-full" : "h-20 w-full"} />)
        )}
      </div>
    </Delayed>
  );
}
