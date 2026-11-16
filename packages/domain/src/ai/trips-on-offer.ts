// The trips the agency sells, as plain lines for the prompts that only need to know what is on offer (Suggest reply, the
// score): the packages the AI could sell today, by name, place, nights and start city, whether or not the agency has
// added its payment QR (these prompts quote no money). No price, date or seat count: those come from code or from the
// chat, never from here.
import type { OrgTx } from "@travel-crm/db";
import type { CalendarDate } from "../kernel/index.js";
import { packagesOnOffer } from "../quotes/index.js";

/** One line per package on offer today: "- <title> · <place> · <n> nights · from <start city>". */
export async function tripsOnOffer(tx: OrgTx, today: CalendarDate): Promise<string[]> {
  const offered = await packagesOnOffer(tx, today);
  if (offered.length === 0) return [];
  const rows = await tx.quoteTemplate.findMany({
    where: { id: { in: offered.map((one) => one.id) } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { title: true, nights: true, startCity: true, destination: { select: { name: true } } },
  });
  return rows.map((row) =>
    [
      `- ${row.title}`,
      row.destination?.name ?? null,
      row.nights === null ? null : `${String(row.nights)} nights`,
      row.startCity.trim() === "" ? null : `from ${row.startCity}`,
    ]
      .filter((part) => part !== null)
      .join(" · "),
  );
}
