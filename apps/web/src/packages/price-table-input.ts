// The price table's typed cells and the api's input made from them: where the table starts from a trip, and what Save
// sends (or which problem stops it, naming the season that has no price).
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import {
  roomTypes,
  savePriceTableInput,
  type PackageDetail,
  type RoomPrices,
  type RoomType,
  type SavePriceTableInput,
  type SeasonColumn,
} from "@travel-crm/contracts/quotes";
import { rupeesFieldText } from "@/components/forms/money-field";

export type Cells = Record<string, string>;
export const cellKey = (column: SeasonColumn, room: RoomType) => `${column.key}|${room}`;

/** The rows (room types sold, and any already priced) and the cells' texts a trip's table starts from. */
export function tableStart(detail: PackageDetail, columns: readonly SeasonColumn[]) {
  const rows = roomTypes.filter(
    (room) => detail.roomTypes.includes(room) || columns.some((c) => c.prices[room] !== null),
  );
  const cells: Cells = {};
  for (const column of columns) {
    for (const room of rows) {
      const price = column.prices[room];
      cells[cellKey(column, room)] = price === null ? "" : rupeesFieldText(price);
    }
  }
  return { rows, cells };
}

export type TableProblem = { kind: "invalid" | "noRoom" } | { kind: "noPrice"; season: string };

export function tableInput(
  packageId: string,
  columns: readonly SeasonColumn[],
  rows: readonly RoomType[],
  cells: Cells,
): { ok: true; input: SavePriceTableInput } | { ok: false; problem: TableProblem } {
  const text = (column: SeasonColumn, room: RoomType) => (cells[cellKey(column, room)] ?? "").trim();
  const unreadable = rows.some((room) =>
    columns.some((column) => text(column, room) !== "" && paiseFromRupeesText(text(column, room)) === null),
  );
  if (unreadable) return { ok: false, problem: { kind: "invalid" } };
  const priceOf = (column: SeasonColumn, room: RoomType) =>
    rows.includes(room) && text(column, room) !== "" ? paiseFromRupeesText(text(column, room)) : null;
  const parsed = savePriceTableInput.safeParse({
    packageId,
    roomTypes: rows,
    columns: columns.map((column) => ({
      seasonIds: column.seasonIds,
      label: column.label,
      prices: Object.fromEntries(roomTypes.map((room) => [room, priceOf(column, room)])) as RoomPrices,
    })),
  });
  if (parsed.success) return { ok: true, input: parsed.data };
  if (parsed.error.issues.some((issue) => issue.path[0] === "roomTypes"))
    return { ok: false, problem: { kind: "noRoom" } };
  const at = parsed.error.issues.find((issue) => issue.path[0] === "columns")?.path[1];
  const season = typeof at === "number" ? (columns[at]?.label ?? "") : "";
  return { ok: false, problem: { kind: "noPrice", season } };
}
