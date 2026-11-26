"use client";

// Two parts of the price table: a season's column head (its name, dates and menu, in the season's colour) and the menu
// that adds a room type not shown yet.
import type { RoomType, SeasonColumn } from "@travel-crm/contracts/quotes";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { rupees } from "@/components/forms/money-field";
import { cn } from "@/lib/utils";
import { PriceCell } from "./price-cell";
import { cellKey, type Cells } from "./price-table-input";
import type { SeasonTint } from "./season-colours";
import { SeasonColumnMenu, type ColumnAction } from "./season-column-menu";
import { seasonDates } from "./season-words";

/** A season's menu: what it offers, whether it is off, and what it tells the table. */
export interface SeasonMenu {
  actions: readonly ColumnAction[];
  disabled: boolean;
  describedBy: string | undefined;
  onOpen: (button: HTMLElement) => void;
  onChoose: (action: ColumnAction) => void;
}

export function SeasonHeadCell({
  column,
  columns,
  tint,
  menu,
}: {
  column: SeasonColumn;
  columns: readonly SeasonColumn[];
  tint: SeasonTint;
  /** The column's menu, or null for someone who may only read. */
  menu: SeasonMenu | null;
}) {
  const t = useTranslations("packages.departuresCalendar");
  return (
    <TableHead className={cn("align-top", tint.fill, tint.ink)}>
      <div className="flex items-start justify-between gap-2 py-2">
        <div>
          <p className="font-medium">{column.label}</p>
          <p className="text-caption font-normal">{seasonDates(t, column, columns)}</p>
        </div>
        {menu !== null && <SeasonColumnMenu season={column.label} {...menu} />}
      </div>
    </TableHead>
  );
}

export function AddRoomMenu({
  remaining,
  disabled,
  onAdd,
}: {
  remaining: readonly RoomType[];
  disabled: boolean;
  onAdd: (room: RoomType) => void;
}) {
  const t = useTranslations("packages.prices");
  const tRooms = useTranslations("packages.form.roomTypeNames");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={remaining.length === 0 || disabled}>
          <PlusIcon aria-hidden="true" />
          {t("addRoom")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {remaining.map((room) => (
          <DropdownMenuItem
            key={room}
            onSelect={() => {
              onAdd(room);
            }}
          >
            {tRooms(room)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One room type's row: its name, a price per season (typed, or read when the person may not change them) and Remove. */
export function PriceRow({
  room,
  columns,
  cells,
  editable,
  onCell,
  onRemove,
}: {
  room: RoomType;
  columns: readonly SeasonColumn[];
  cells: Cells;
  editable: boolean;
  onCell: (column: SeasonColumn, text: string) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("packages.prices");
  const tRooms = useTranslations("packages.form.roomTypeNames");
  return (
    <TableRow>
      <TableHead scope="row" className="font-medium">
        {tRooms(room)}
      </TableHead>
      {columns.map((column) => {
        const price = column.prices[room];
        return (
          <TableCell key={column.key} className="numbers">
            {editable ? (
              <PriceCell
                value={cells[cellKey(column, room)] ?? ""}
                label={t("cell", { room: tRooms(room), season: column.label })}
                notSold={t("notSold")}
                onChange={(text) => {
                  onCell(column, text);
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
      {editable && (
        <TableCell className="text-right">
          <Button variant="ghost" size="icon" aria-label={t("removeRoom", { room: tRooms(room) })} onClick={onRemove}>
            <Trash2Icon aria-hidden="true" />
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}
