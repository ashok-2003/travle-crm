"use client";

// A group trip's price table: a row per room type sold, a column per season (its colour, its dates, and its Change dates,
// Rename and Remove), the price per person typed in each cell, one Save for the whole table. A blank cell is "Not sold"
// for that season; a new row comes from the room types not shown yet, and removing a row clears it from every season.
// Seasons that share a name and prices (Regular around Christmas) are one column. Without quotes:edit it is only to
// read. The page gives it a new key when the trip is read again, so it starts from what was saved.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import {
  roomTypes,
  savePriceTableInput,
  seasonColumns,
  type PackageDetail,
  type RoomPrices,
  type RoomType,
  type SeasonColumn,
} from "@travel-crm/contracts/quotes";
import { EllipsisIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { groupedRupees, rupees, rupeesFieldText } from "@/components/forms/money-field";
import { RefusalAlert } from "@/components/refusal-alert";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { RenameSeasonDialog } from "./rename-season-dialog";
import { seasonTint } from "./season-colours";
import { ChangeDatesDialog } from "./season-dialog";
import { useSeasonDates } from "./season-dates";
import { usePackageChanges, usePackageColumnChanges } from "./use-packages";

type Problem = "noPrice" | "invalid" | "noRoom";
type ColumnAction = "dates" | "rename" | "remove";

const cellKey = (column: SeasonColumn, room: RoomType) => `${column.key}|${room}`;

/** A price in a cell, in rupees; the box says what empty means. */
function PriceCell({
  value,
  label,
  notSold,
  onChange,
}: {
  value: string;
  label: string;
  notSold: string;
  onChange: (text: string) => void;
}) {
  return (
    <InputGroup>
      <InputGroupAddon>
        <InputGroupText aria-hidden="true">₹</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        aria-label={label}
        value={value}
        placeholder={notSold}
        inputMode="decimal"
        autoComplete="off"
        className="numbers text-right"
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onBlur={() => {
          onChange(groupedRupees(value));
        }}
      />
    </InputGroup>
  );
}

export function PriceTable({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.prices");
  const tRooms = useTranslations("packages.form.roomTypeNames");
  const describeDates = useSeasonDates();
  const mayEdit = useHolds("quotes:edit");
  const access = useWriteAccess("change");
  const hintId = `${useId()}-write`;
  const { savePriceTable } = usePackageChanges();
  const { removeSeasons } = usePackageColumnChanges();
  const columns = useMemo(() => seasonColumns(detail.seasons), [detail.seasons]);
  const start = useMemo(() => {
    const rows = roomTypes.filter(
      (room) => detail.roomTypes.includes(room) || columns.some((c) => c.prices[room] !== null),
    );
    const cells: Record<string, string> = {};
    for (const column of columns) {
      for (const room of rows) {
        const price = column.prices[room];
        cells[cellKey(column, room)] = price === null ? "" : rupeesFieldText(price);
      }
    }
    return { rows, cells };
  }, [columns, detail.roomTypes]);
  const [rows, setRows] = useState<RoomType[]>(start.rows);
  const [cells, setCells] = useState(start.cells);
  const [problem, setProblem] = useState<Problem | null>(null);
  // A room priced in a season but not yet sold (a first season of a new trip) is saved with the table too.
  const changed =
    JSON.stringify({ rows, cells }) !== JSON.stringify(start) || rows.some((room) => !detail.roomTypes.includes(room));
  // The column a dialog is about stays after it closes, so the dialog can finish closing.
  const [target, setTarget] = useState<SeasonColumn | null>(null);
  const [action, setAction] = useState<ColumnAction | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const remaining = roomTypes.filter((room) => !rows.includes(room));

  const save = () => {
    const unreadable = rows.some((room) =>
      columns.some((column) => {
        const text = (cells[cellKey(column, room)] ?? "").trim();
        return text !== "" && paiseFromRupeesText(text) === null;
      }),
    );
    if (unreadable) {
      setProblem("invalid");
      return;
    }
    const priceOf = (column: SeasonColumn, room: RoomType) => {
      const text = (cells[cellKey(column, room)] ?? "").trim();
      return rows.includes(room) && text !== "" ? paiseFromRupeesText(text) : null;
    };
    const parsed = savePriceTableInput.safeParse({
      packageId: detail.id,
      roomTypes: rows,
      columns: columns.map((column) => ({
        seasonIds: column.seasonIds,
        label: column.label,
        prices: Object.fromEntries(roomTypes.map((room) => [room, priceOf(column, room)])) as RoomPrices,
      })),
    });
    if (!parsed.success) {
      setProblem(parsed.error.issues.some((issue) => issue.path[0] === "roomTypes") ? "noRoom" : "noPrice");
      return;
    }
    setProblem(null);
    savePriceTable.mutate(parsed.data, { onSuccess: () => toast.success(t("saved")) });
  };

  const choose = (column: SeasonColumn, next: ColumnAction) => {
    setTarget(column);
    setAction(next);
  };
  const close = (open: boolean) => {
    if (!open) setAction(null);
  };

  if (columns.length === 0) {
    return <p className="text-muted-foreground">{t("noSeasons")}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("roomType")}</TableHead>
            {columns.map((column, index) => {
              const tint = seasonTint(index);
              return (
                <TableHead key={column.key} className={cn("align-top", tint.fill, tint.ink)}>
                  <div className="flex items-start justify-between gap-2 py-2">
                    <div>
                      <p className="font-medium">{column.label}</p>
                      <p className="text-caption font-normal">{describeDates(column, columns.length)}</p>
                    </div>
                    {mayEdit && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("seasonMenu", { season: column.label })}
                            onClick={(event) => {
                              opener.current = event.currentTarget;
                            }}
                          >
                            <EllipsisIcon aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={!access.allowed}
                            onSelect={() => {
                              choose(column, "dates");
                            }}
                          >
                            {t("changeDates")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!access.allowed}
                            onSelect={() => {
                              choose(column, "rename");
                            }}
                          >
                            {t("rename")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={!access.allowed}
                            onSelect={() => {
                              choose(column, "remove");
                            }}
                          >
                            {t("remove")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </TableHead>
              );
            })}
            {mayEdit && (
              <TableHead>
                <span className="sr-only">{t("removeRoomColumn")}</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((room) => (
            <TableRow key={room}>
              <TableHead scope="row" className="font-medium">
                {tRooms(room)}
              </TableHead>
              {columns.map((column) => {
                const text = cells[cellKey(column, room)] ?? "";
                const price = column.prices[room];
                return (
                  <TableCell key={column.key} className="numbers">
                    {mayEdit ? (
                      <PriceCell
                        value={text}
                        label={t("cell", { room: tRooms(room), season: column.label })}
                        notSold={t("notSold")}
                        onChange={(next) => {
                          setCells((now) => ({ ...now, [cellKey(column, room)]: next }));
                        }}
                      />
                    ) : price === null ? (
                      <span className="text-muted-foreground">{t("notSold")}</span>
                    ) : (
                      rupees(price)
                    )}
                  </TableCell>
                );
              })}
              {mayEdit && (
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("removeRoom", { room: tRooms(room) })}
                    onClick={() => {
                      setRows((now) => now.filter((other) => other !== room));
                    }}
                  >
                    <Trash2Icon aria-hidden="true" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {problem !== null && (
        <Alert variant="destructive">
          <AlertDescription>{t(`problems.${problem}`)}</AlertDescription>
        </Alert>
      )}
      <RefusalAlert error={savePriceTable.error} />
      {mayEdit && (
        <div>
          <div className="flex flex-wrap gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={remaining.length === 0 || !access.allowed}>
                  <PlusIcon aria-hidden="true" />
                  {t("addRoom")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {remaining.map((room) => (
                  <DropdownMenuItem
                    key={room}
                    onSelect={() => {
                      setRows((now) => [...now, room]);
                    }}
                  >
                    {tRooms(room)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              disabled={!changed || savePriceTable.isPending || !access.allowed}
              aria-describedby={access.allowed ? undefined : hintId}
              onClick={save}
            >
              {savePriceTable.isPending && <Spinner aria-hidden="true" />}
              {savePriceTable.isPending ? t("saving") : t("save")}
            </Button>
          </div>
          <WriteHint id={hintId} hint={access.hint} />
        </div>
      )}
      {target !== null && (
        <>
          <ChangeDatesDialog
            packageId={detail.id}
            column={target}
            held={{ open: action === "dates", setOpen: close }}
            returnFocusTo={opener}
          />
          <RenameSeasonDialog
            packageId={detail.id}
            column={target}
            held={{ open: action === "rename", setOpen: close }}
            returnFocusTo={opener}
          />
          <ConfirmDialog
            open={action === "remove"}
            onOpenChange={close}
            title={t("removeTitle", { season: target.label })}
            description={t("removeDescription")}
            action={t("remove")}
            request={removeSeasons}
            returnFocusTo={opener}
            onConfirm={() => {
              removeSeasons.mutate(target.seasonIds, {
                onSuccess: () => {
                  toast.success(t("removed"));
                  setAction(null);
                },
              });
            }}
          />
        </>
      )}
    </div>
  );
}
