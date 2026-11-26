"use client";

// The price table on a phone, a season at a time: a tab per season in its colour, and in its panel the season's dates on
// one line, its menu and a full-width price per room type. It only draws the table's state; the table keeps it and saves it.
import type { RoomType, SeasonColumn } from "@travel-crm/contracts/quotes";
import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { rupees } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { PriceCell } from "./price-cell";
import { cellKey, type Cells } from "./price-table-input";
import type { SeasonMenu } from "./price-table-parts";
import { seasonTint } from "./season-colours";
import { SeasonColumnMenu } from "./season-column-menu";
import { seasonDates } from "./season-words";

export function PriceSeasonTabs({
  columns,
  rows,
  cells,
  editable,
  menuFor,
  onCell,
  onRemove,
}: {
  columns: readonly SeasonColumn[];
  rows: readonly RoomType[];
  cells: Cells;
  editable: boolean;
  menuFor: (column: SeasonColumn) => SeasonMenu | null;
  onCell: (column: SeasonColumn, room: RoomType, text: string) => void;
  onRemove: (room: RoomType) => void;
}) {
  const t = useTranslations("packages.prices");
  const tDates = useTranslations("packages.departuresCalendar");
  const tRooms = useTranslations("packages.form.roomTypeNames");
  const [chosen, setChosen] = useState<string | null>(null);
  const current = columns.find((column) => column.key === chosen) ?? columns[0];
  return (
    <Tabs value={current?.key} onValueChange={setChosen}>
      <TabsList className="w-full justify-start overflow-x-auto">
        {columns.map((column, index) => {
          const tint = seasonTint(index);
          return (
            <TabsTrigger
              key={column.key}
              value={column.key}
              className={cn(tint.fill, tint.ink, tint.active, "opacity-70 data-active:opacity-100")}
            >
              {column.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {columns.map((column, index) => {
        const tint = seasonTint(index);
        const menu = menuFor(column);
        return (
          <TabsContent
            key={column.key}
            value={column.key}
            className={`flex flex-col gap-3 rounded-lg p-4 ${tint.fill} ${tint.ink}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p>{seasonDates(tDates, column, columns)}</p>
              {menu !== null && <SeasonColumnMenu season={column.label} {...menu} />}
            </div>
            {rows.map((room) => {
              const price = column.prices[room];
              return (
                <div key={room} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 font-medium">{tRooms(room)}</span>
                  <div className="numbers flex-1">
                    {editable ? (
                      <PriceCell
                        value={cells[cellKey(column, room)] ?? ""}
                        label={t("cell", { room: tRooms(room), season: column.label })}
                        notSold={t("notSold")}
                        onChange={(text) => {
                          onCell(column, room, text);
                        }}
                      />
                    ) : price === null ? (
                      <span>{t("notSold")}</span>
                    ) : (
                      rupees(price)
                    )}
                  </div>
                  {editable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("removeRoom", { room: tRooms(room) })}
                      onClick={() => {
                        onRemove(room);
                      }}
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  )}
                </div>
              );
            })}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
