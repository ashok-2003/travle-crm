// A row's content by its headers, not its places (M1): the cells that are not blank, each with the key of its column's
// header, in key order. A column inserted, deleted at the far end or moved leaves it as it was, so a row that cannot be read
// as an enquiry (no contact, a bad phone, a date to come) is still known as the row it was at connect.
import { createHash } from "node:crypto";
import { nameColumns } from "./header-keys.js";

export function contentFingerprint(header: readonly string[], cells: readonly string[]): Uint8Array {
  const keys = nameColumns(header).map(({ key }) => key);
  const pairs = keys
    .flatMap((key, index) => {
      const cell = (cells[index] ?? "").trim();
      return cell === "" ? [] : [`${key}\u0000${cell}`];
    })
    .sort();
  return new Uint8Array(createHash("sha256").update("sheet-content\u0000").update(JSON.stringify(pairs)).digest());
}
