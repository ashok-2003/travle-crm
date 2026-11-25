"use client";

// A group trip's price table: a row per room type sold, a column per season (its colour, its dates and its menu), the
// price per person typed in each cell, one Save for the whole table. A blank cell is "Not sold" for that season; a new
// row comes from the room types not shown yet, and removing a row clears it from every season. Seasons that share a name
// and prices (Regular around Christmas) are one column, in `seasonColumns`' order (the calendar's colours follow it).
// While the table has changes not saved, season changes are off (they read the trip again), and Undo changes goes back.
// Without quotes:edit it is only to read. The page gives it a new key when the trip is read again.
import {
  OPEN_SEASON_END,
  roomTypes,
  seasonColumns,
  type PackageDetail,
  type RoomType,
  type SeasonColumn,
} from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { cellKey, tableInput, tableStart, type TableProblem } from "./price-table-input";
import { seasonTint } from "./season-colours";
import { SeasonColumnDialogs } from "./season-column-dialogs";
import { AddRoomMenu, PriceRow, SeasonHeadCell } from "./price-table-parts";
import type { ColumnAction } from "./season-column-menu";
import { usePackageChanges, usePackageColumnChanges } from "./use-packages";

/** What a column's menu offers: its dates when it is one range; else "no end date" on the trip's last season, if it ends. */
function actionsOf(column: SeasonColumn, tripEnd: string): ColumnAction[] {
  const last = column.ranges.at(-1);
  if (column.ranges.length === 1) return ["dates", "rename", "remove"];
  return last !== undefined && !column.open && last.endsOn === tripEnd
    ? ["noEnd", "rename", "remove"]
    : ["rename", "remove"];
}

export function PriceTable({
  detail,
  onEdited,
}: {
  detail: PackageDetail;
  /** Tells the page whether the table holds changes not saved. */
  onEdited: (edited: boolean) => void;
}) {
  const t = useTranslations("packages.prices");
  const mayEdit = useHolds("quotes:edit");
  const access = useWriteAccess("change");
  const hintId = `${useId()}-write`;
  const { savePriceTable } = usePackageChanges();
  const { saveSeasons } = usePackageColumnChanges();
  const columns = useMemo(() => seasonColumns(detail.seasons), [detail.seasons]);
  const tripEnd = detail.seasons.reduce((latest, season) => (season.endsOn > latest ? season.endsOn : latest), "");
  const start = useMemo(() => tableStart(detail, columns), [detail, columns]);
  const [rows, setRows] = useState<RoomType[]>(start.rows);
  const [cells, setCells] = useState(start.cells);
  const [problem, setProblem] = useState<TableProblem | null>(null);
  const edited = JSON.stringify({ rows, cells }) !== JSON.stringify(start);
  // A room priced in a season but not yet sold (a first season of a new trip) is saved with the table too.
  const canSave = edited || rows.some((room) => !detail.roomTypes.includes(room));
  useEffect(() => {
    onEdited(edited);
  }, [edited, onEdited]);
  const [target, setTarget] = useState<SeasonColumn | null>(null);
  const [action, setAction] = useState<ColumnAction | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const remaining = roomTypes.filter((room) => !rows.includes(room));

  const save = () => {
    const made = tableInput(detail.id, columns, rows, cells);
    setProblem(made.ok ? null : made.problem);
    if (made.ok) savePriceTable.mutate(made.input, { onSuccess: () => toast.success(t("saved")) });
  };
  const choose = (column: SeasonColumn, next: ColumnAction) => {
    const piece = column.seasonIds.at(-1);
    const range = column.ranges.at(-1);
    if (next === "noEnd" && piece !== undefined && range !== undefined) {
      saveSeasons.mutate(
        [
          {
            packageId: detail.id,
            seasonId: piece,
            label: column.label,
            ...range,
            endsOn: OPEN_SEASON_END,
            prices: column.prices,
          },
        ],
        { onSuccess: () => toast.success(t("noEndSaved")) },
      );
      return;
    }
    setTarget(column);
    setAction(next);
  };

  if (columns.length === 0) return <p className="text-muted-foreground">{t("noSeasons")}</p>;
  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("roomType")}</TableHead>
            {columns.map((column, index) => (
              <SeasonHeadCell
                key={column.key}
                column={column}
                columns={columns}
                tint={seasonTint(index)}
                menu={
                  mayEdit
                    ? {
                        actions: actionsOf(column, tripEnd),
                        disabled: edited || !access.allowed,
                        describedBy: edited ? hintId : undefined,
                        onOpen: (button) => {
                          opener.current = button;
                        },
                        onChoose: (next) => {
                          choose(column, next);
                        },
                      }
                    : null
                }
              />
            ))}
            {mayEdit && (
              <TableHead>
                <span className="sr-only">{t("removeRoomColumn")}</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((room) => (
            <PriceRow
              key={room}
              room={room}
              columns={columns}
              cells={cells}
              editable={mayEdit}
              onCell={(column, text) => {
                setCells((now) => ({ ...now, [cellKey(column, room)]: text }));
              }}
              onRemove={() => {
                setRows((now) => now.filter((other) => other !== room));
              }}
            />
          ))}
        </TableBody>
      </Table>
      {problem !== null && (
        <Alert variant="destructive">
          <AlertDescription>
            {problem.kind === "noPrice"
              ? t("problems.noPrice", { season: problem.season })
              : t(`problems.${problem.kind}`)}
          </AlertDescription>
        </Alert>
      )}
      <RefusalAlert error={savePriceTable.error} />
      <RefusalAlert error={saveSeasons.error} />
      {mayEdit && (
        <div>
          <div className="flex flex-wrap gap-3">
            <AddRoomMenu
              remaining={remaining}
              disabled={!access.allowed}
              onAdd={(room) => {
                setRows((now) => [...now, room]);
              }}
            />
            <Button
              disabled={!canSave || savePriceTable.isPending || !access.allowed}
              aria-describedby={access.allowed ? undefined : hintId}
              onClick={save}
            >
              {savePriceTable.isPending && <Spinner aria-hidden="true" />}
              {savePriceTable.isPending ? t("saving") : t("save")}
            </Button>
            {edited && (
              <Button
                variant="outline"
                disabled={savePriceTable.isPending}
                onClick={() => {
                  setRows(start.rows);
                  setCells(start.cells);
                  setProblem(null);
                }}
              >
                {t("undo")}
              </Button>
            )}
          </div>
          <WriteHint id={hintId} hint={access.hint ?? (edited ? t("unsavedHint") : null)} />
        </div>
      )}
      {target !== null && (
        <SeasonColumnDialogs
          packageId={detail.id}
          roomTypes={detail.roomTypes}
          column={target}
          action={action}
          onClose={() => {
            setAction(null);
          }}
          returnFocusTo={opener}
        />
      )}
    </div>
  );
}
