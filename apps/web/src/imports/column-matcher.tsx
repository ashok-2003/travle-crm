"use client";

// Matching a file's columns to fields (spec 3.2 step 2, B8-B10, D34): each column's name, up to three samples and a
// Select of what it holds, "Don't import" first; "As last time" beside a field the agency matched to a column of this
// name before. A field another column holds is shown as "Phone · matched to 'Mobile No'" and can't be picked: each
// field takes one column, but Note takes several. A Table on a computer, an ItemGroup on a phone.
import type { ImportColumn, ImportField } from "@travel-crm/contracts/imports";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWideScreen } from "@/lib/use-wide-screen";
import { MatchSelect, type MatchOption } from "./match-select";

export function ColumnMatcher({
  columns,
  fields,
  chosen,
  onChoose,
  disabled = false,
}: {
  columns: readonly ImportColumn[];
  /** The kind's fields with their words, in the order the Select offers them. */
  fields: readonly { field: ImportField; label: string }[];
  /** Each column's field by its position; null for Don't import. */
  chosen: ReadonlyMap<number, ImportField | null>;
  onChoose: (position: number, field: ImportField | null) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("imports.columns");
  const wide = useWideScreen();
  const holder = new Map<ImportField, string>();
  for (const column of columns) {
    const field = chosen.get(column.position) ?? null;
    if (field !== null && !holder.has(field)) holder.set(field, column.header);
  }
  /** The fields for one column: those another column holds are named so, and off, but Note. */
  const optionsFor = (column: ImportColumn): MatchOption[] =>
    fields.map(({ field, label }) => {
      const heldBy = holder.get(field);
      const taken = field !== "note" && heldBy !== undefined && chosen.get(column.position) !== field;
      return taken
        ? { value: field, label: t("matchedTo", { field: label, column: heldBy }), disabled: true }
        : { value: field, label };
    });
  const samplesOf = (column: ImportColumn) =>
    column.samples.length === 0 ? t("noSamples") : column.samples.join(" · ");
  /** "As last time" while the column still holds the field the agency's last match guessed. */
  const asLastTime = (column: ImportColumn) =>
    column.guessedBy === "last-time" && (chosen.get(column.position) ?? null) === column.field;
  const select = (column: ImportColumn) => (
    <MatchSelect
      label={t("fieldFor", { column: column.header })}
      value={chosen.get(column.position) ?? null}
      noneLabel={t("dontImport")}
      options={optionsFor(column)}
      disabled={disabled}
      onChange={(field) => {
        onChoose(column.position, field as ImportField | null);
      }}
    />
  );
  const lastTime = (column: ImportColumn) =>
    asLastTime(column) && <span className="text-label text-muted-foreground">{t("asLastTime")}</span>;

  if (!wide) {
    return (
      <ItemGroup>
        {columns.map((column, index) => (
          <Fragment key={column.position}>
            {index > 0 && <ItemSeparator />}
            <Item size="sm" role="listitem">
              <ItemContent>
                <ItemTitle className="flex-wrap wrap-anywhere script-leading">
                  {column.header}
                  {lastTime(column)}
                </ItemTitle>
                <ItemDescription className="wrap-anywhere script-leading">{samplesOf(column)}</ItemDescription>
              </ItemContent>
              <div className="basis-full">{select(column)}</div>
            </Item>
          </Fragment>
        ))}
      </ItemGroup>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t("column")}</TableHead>
          <TableHead scope="col">{t("samples")}</TableHead>
          <TableHead scope="col">{t("importAs")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {columns.map((column) => (
          <TableRow key={column.position}>
            <TableCell className="whitespace-normal">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium wrap-anywhere script-leading">{column.header}</span>
                {lastTime(column)}
              </div>
            </TableCell>
            <TableCell className="whitespace-normal wrap-anywhere text-muted-foreground script-leading">
              {samplesOf(column)}
            </TableCell>
            <TableCell className="w-72 whitespace-normal">{select(column)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
