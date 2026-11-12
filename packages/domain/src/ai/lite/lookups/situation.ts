// Runs the Understand model's lookup requests (checked, at most four) and gathers the chosen package's situation.
import type { AgencyAnswers, LiteFacts } from "@travel-crm/contracts/ai";
import { adultRoomTypes, type RoomType } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { openDepartureDetails } from "../../../departures/index.js";
import type { CalendarDate } from "../../../kernel/index.js";
import type { LookupRequest, LookupResult, PackageIndexEntry, Situation, SituationPackage } from "../types.js";
import { findPackages } from "./find-packages.js";
import { datesAndSeats, packageDetails, pickupsOf, priceOf } from "./package-reads.js";

const MOST_LOOKUPS = 4;
const MOST_DEPARTURES = 20;

export interface LookupContext {
  index: PackageIndexEntry[];
  answers: AgencyAnswers;
  facts: LiteFacts;
  today: CalendarDate;
  now: Date;
}

const keyOf = (request: LookupRequest) =>
  JSON.stringify([request.tool, request.words, request.package, request.month, request.topic]);

async function lookup(tx: OrgTx, context: LookupContext, request: LookupRequest): Promise<LookupResult> {
  const { tool } = request;
  if (tool === "find_packages") {
    if (request.words === null || request.words.trim() === "") return { tool, error: "missing_input" };
    return { tool, words: request.words, ...findPackages(context.index, request.words) };
  }
  if (tool === "agency_answer") {
    if (request.topic === null) return { tool, error: "missing_input" };
    return { tool, topic: request.topic, answer: context.answers[request.topic] ?? null };
  }
  if (request.package === null || request.package.trim() === "") return { tool, error: "missing_input" };
  const wanted = request.package.trim().toLowerCase();
  const found = context.index.find((one) => one.title.toLowerCase() === wanted);
  if (found === undefined) return { tool, error: "unknown_package" };
  if (tool === "package_details") {
    const details = await packageDetails(tx, found.id);
    return details === null ? { tool, error: "unknown_package" } : { tool, details };
  }
  if (tool === "dates_and_seats") {
    if (request.month !== null && request.month < context.today.slice(0, 7)) return { tool, error: "bad_month" };
    const seats = context.facts.adults === null ? 1 : context.facts.adults + (context.facts.children?.count ?? 0);
    const departures = await datesAndSeats(tx, found.id, {
      month: request.month,
      seats,
      today: context.today,
      now: context.now,
    });
    return { tool, packageId: found.id, month: request.month, departures };
  }
  return { tool, price: await priceOf(tx, found.id, context.facts, context.today, context.now) };
}

export async function runLookups(
  tx: OrgTx,
  context: LookupContext,
  requests: LookupRequest[],
): Promise<Situation["looked"]> {
  const seen = new Set<string>();
  const wanted = requests
    .filter((request) => !seen.has(keyOf(request)) && seen.add(keyOf(request)))
    .slice(0, MOST_LOOKUPS);
  const looked: Situation["looked"] = [];
  // One step at a time: a transaction runs one query at once.
  for (const request of wanted) looked.push({ request, result: await lookup(tx, context, request) });
  return looked;
}

async function situationPackage(tx: OrgTx, context: LookupContext): Promise<SituationPackage | null> {
  const entry = context.index.find((one) => one.id === context.facts.packageId);
  if (entry === undefined) return null;
  const row = await tx.quoteTemplate.findUnique({
    where: { id: entry.id },
    select: { pickupPoints: true, roomTypes: true },
  });
  if (row === null) return null;
  const offered = row.roomTypes as RoomType[];
  const open = await openDepartureDetails(tx, entry.id, context.today, context.now);
  return {
    ...entry,
    pickups: pickupsOf(row.pickupPoints),
    offered,
    adultRooms: adultRoomTypes.filter((type) => offered.includes(type)),
    departures: open
      .slice(0, MOST_DEPARTURES)
      .map((one) => ({ id: one.id, startsOn: one.startsOn, freeSeats: one.freeSeats })),
  };
}

export async function situationOf(tx: OrgTx, context: LookupContext, requests: LookupRequest[]): Promise<Situation> {
  const chosen = await situationPackage(tx, context);
  const price = chosen === null ? null : await priceOf(tx, chosen.id, context.facts, context.today, context.now);
  return { package: chosen, price, looked: await runLookups(tx, context, requests) };
}
