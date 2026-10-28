// Rows pasted from a sheet into the invite program's form (the owner, 2026-10-28): copied cells come tab-separated (a
// .csv's lines, comma-separated, work too), in the order Company, Owner, Phone, Email, City; a header row is skipped.
// Each row is checked as the api will check it, so the preview shows what will be invited and what can't be.
import { vipInviteRow, type VipInviteRow } from "@travel-crm/contracts/platform";

export type ReadRow = { line: number; row: VipInviteRow; problem: null } | { line: number; row: null; problem: string };

const HEADER = /company|business|agency/i;

function cellsOf(line: string): string[] {
  const separator = line.includes("\t") ? "\t" : ",";
  return line.split(separator).map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

export function readInviteRows(text: string): ReadRow[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim() !== "");
  const first = lines[0];
  const body = first !== undefined && HEADER.test(first) ? lines.slice(1) : lines;
  const offset = lines.length - body.length;
  return body.map((line, index) => {
    const [companyName = "", ownerName = "", phone = "", email = "", city = ""] = cellsOf(line);
    const parsed = vipInviteRow.safeParse({
      companyName,
      ownerName,
      ownerPhone: phone === "" ? null : phone,
      ownerEmail: email === "" ? null : email,
      city: city === "" ? null : city,
    });
    return parsed.success
      ? { line: index + 1 + offset, row: parsed.data, problem: null }
      : { line: index + 1 + offset, row: null, problem: parsed.error.issues[0]?.message ?? "Not a valid row" };
  });
}
