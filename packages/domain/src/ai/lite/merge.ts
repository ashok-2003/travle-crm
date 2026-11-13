// Folds the checked form into the chat's lite facts, and reads and saves those facts (the lite agent's memory between turns).
import { liteFacts, type LiteFacts } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import type { TripField } from "./lead-writes.js";
import { findPackages } from "./lookups/find-packages.js";
import type { CheckedForm, PackageIndexEntry } from "./types.js";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A detail replaces its fact when the fact is empty or the customer changed it; a change clears what it outdates. A
 * field a person typed on the lead (`locked`) is never changed: only a day inside the month they typed narrows it.
 */
export function mergeForm(
  facts: LiteFacts,
  checked: CheckedForm,
  index: PackageIndexEntry[],
  locked: ReadonlySet<TripField> = new Set(),
): LiteFacts {
  const details = checked.form.details;
  const next: LiteFacts = { ...facts, language: checked.form.language };
  const clearDeparture = () => {
    next.departureId = null;
    next.quoted = null;
  };

  if (details.package) {
    const wanted = details.package.name.toLowerCase();
    const found = index.find((entry) => entry.title.toLowerCase() === wanted);
    if (found && found.id !== next.packageId) {
      next.packageId = found.id;
      clearDeparture();
    }
  }
  if (details.place && (next.placeWords === null || details.place.changed)) {
    const exact = findPackages(index, details.place.words).exact;
    const only = exact.length === 1 ? exact[0] : undefined;
    if (only && next.packageId === null) next.packageId = only.id;
    else next.placeWords = details.place.words;
  }
  const said = details.date;
  // A day inside the month already known narrows it (no change of mind is needed for that), and a new day in it replaces
  // the old one: a person who typed the month typed no day, so the day stays the customer's to change.
  const narrows =
    next.month !== null &&
    (said?.day?.startsWith(next.month) ?? false) &&
    (next.day === null || said?.changed === true);
  const free = !locked.has("when");
  if (said && ((free && ((next.day === null && next.month === null) || said.changed)) || narrows)) {
    const day = said.day;
    const month = said.month ?? day?.slice(0, 7) ?? null;
    if (day !== next.day || month !== next.month) clearDeparture();
    next.day = day;
    next.month = month;
  }
  if (details.adults && !locked.has("adults") && (next.adults === null || details.adults.changed)) {
    if (next.adults !== details.adults.count) next.quoted = null;
    next.adults = details.adults.count;
  }
  if (details.children && !locked.has("children_ages") && (next.children === null || details.children.changed)) {
    const children = { count: details.children.count, ages: details.children.ages };
    if (!same(next.children, children)) next.quoted = null;
    next.children = children;
  }
  if (details.name) next.name = details.name.full;
  if (
    details.pickup_city &&
    !locked.has("departure_city") &&
    (next.pickupCity === null || details.pickup_city.changed)
  ) {
    next.pickupCity = details.pickup_city.words;
  }
  if (details.room && !locked.has("room_type") && (next.roomType === null || details.room.changed)) {
    next.roomType = details.room.type;
  }
  if (details.pay_in_full) next.payInFull = true;
  return next;
}

/** A row that is missing, grounded or unreadable reads as empty lite facts. */
export async function readLiteFacts(tx: OrgTx, conversationId: string): Promise<LiteFacts> {
  const row = await tx.aiChat.findFirst({ where: { conversationId }, select: { facts: true } });
  const parsed = liteFacts.safeParse(row?.facts ?? {});
  return parsed.success ? parsed.data : liteFacts.parse({ agent: "lite" });
}

/** Saves the facts, making the chat's row if the AI has not touched this chat before. */
export async function saveLiteFacts(tx: OrgTx, conversationId: string, facts: LiteFacts): Promise<void> {
  const organizationId = (
    await tx.whatsappConversation.findUniqueOrThrow({ where: { id: conversationId }, select: { organizationId: true } })
  ).organizationId;
  const data = liteFacts.parse(facts);
  await tx.aiChat.upsert({
    where: { organizationId_conversationId: { organizationId, conversationId } },
    create: { conversationId, facts: data },
    update: { facts: data },
  });
}
