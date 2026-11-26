// Model call 1 of a package draft: which trips do the agency's documents sell? The AI names each with the line tokens that describe it;
// code keeps only tokens that are real lines, matches each place to an existing destination (never creating one), and saves only the
// fill's row. Shaped like readRateSheet: short transactions around the model, one monthly call taken first and given back when nothing
// usable came. Documents longer than one call are offered by part first, and cost nothing until one is chosen.
import {
  MAX_FOUND_TRIPS,
  foundTripsAnswer,
  type FindTripsInput,
  type FoundTrip,
  type FoundTrips,
} from "@travel-crm/contracts/ai";
import type { Database, OrgTx } from "@travel-crm/db";
import type { AiMessage, AiModel } from "@travel-crm/integrations/ai";
import type { AiPrompts } from "@travel-crm/integrations/prompts";
import { searchDestinations } from "../../catalog/index.js";
import { organizationTimeZone, type MemberAccess } from "../../identity/index.js";
import { fenced } from "../fenced.js";
import { filled, managedPrompt } from "../managed-prompt.js";
import { jsonObjectIn } from "../fill/json.js";
import { modelRefusal, refuse } from "../refusals.js";
import { aiEnabled } from "../settings.js";
import { hashOf } from "../suggest.js";
import { recordTokens, releaseAiCall, reserveAiCall } from "../usage.js";
import { FIND_TRIPS_PROMPT_TEXT } from "./prompt-text.js";
import { linesAsText, linesHash, packageSources, partsOf, resolveTokens, type SourcePiece } from "./sources.js";

export const FIND_TRIPS_PROMPT_NAME = "package-drafts/find-trips";

const prompt = (pieces: readonly SourcePiece[], instructions: string): AiMessage[] => [
  { role: "system", content: instructions },
  { role: "user", content: `The documents:\n<data>${fenced(linesAsText(pieces))}</data>\n\nList the trips.` },
];

interface Checked {
  timeZone: string;
  pieces: SourcePiece[];
}

async function check(tx: OrgTx, access: MemberAccess): Promise<Checked> {
  if (!(await aiEnabled(tx))) {
    throw refuse("AI_OFF", "The AI is off for this agency: an Owner or Admin turns it on in Settings, AI");
  }
  return { timeZone: await organizationTimeZone(tx, access.organizationId), pieces: await packageSources(tx) };
}

const nothing = () => refuse("PACKAGE_DRAFT_NOTHING", "The AI found no trips in your documents", "VALIDATION");

/** The existing destination a place names: the one with that name in any case, or the only close one; none is ever created. */
export async function destinationOf(tx: OrgTx, place: string) {
  if (place === "") return null;
  const close = await searchDestinations(tx, { query: place, limit: 5 });
  return (
    close.find((one) => one.name.toLowerCase() === place.toLowerCase()) ??
    (close.length === 1 ? close[0] : undefined) ??
    null
  );
}

export async function findTrips(
  { db, model, prompts }: { db: Database; model: AiModel; prompts?: AiPrompts | undefined },
  access: MemberAccess,
  input: FindTripsInput,
  now: Date,
): Promise<FoundTrips> {
  const { organizationId } = access;
  if (!model.configured) throw refuse("AI_NOT_READY", "The AI isn't set up on this server yet");
  const checked = await db.forOrg(organizationId, (tx) => check(tx, access));
  const parts = partsOf(checked.pieces);
  if (parts.length === 0) throw nothing();
  const offered = parts.map(({ ref, label }) => ({ ref, label }));
  const chosen = input.part ?? (parts.length === 1 ? parts[0]?.ref : undefined);
  if (chosen === undefined) {
    // Long documents: nothing is read yet. The parts are offered, and no call is used.
    return { fillId: null, trips: [], parts: offered, readPart: null };
  }
  const part = parts.find((one) => one.ref === chosen);
  if (part === undefined) throw refuse("PACKAGE_DRAFT_PART", "There is no such part of your documents", "VALIDATION");

  // One monthly call, taken before the model is asked and given back when it doesn't answer.
  const reserved = await db.forOrg(organizationId, (tx) => reserveAiCall(tx, now, checked.timeZone));
  if (!reserved) throw refuse("AI_MONTH_LIMIT", "This agency has used this month's AI suggestions", "LIMIT_REACHED");
  const giveBack = () => db.forOrg(organizationId, (tx) => releaseAiCall(tx, now, checked.timeZone));
  let result;
  try {
    const instructions = await managedPrompt(prompts, FIND_TRIPS_PROMPT_NAME, FIND_TRIPS_PROMPT_TEXT);
    result = await model.complete({
      feature: "draft_packages",
      messages: prompt(part.pieces, filled(instructions.text, { max_trips: String(MAX_FOUND_TRIPS) })),
      ...(instructions.source === undefined
        ? {}
        : { prompt: { name: instructions.source.name, version: instructions.source.version } }),
      json: true,
      maxTokens: 4000,
      // Opaque: the agency's id, never a person's.
      user: organizationId,
    });
  } catch (error) {
    await giveBack();
    throw error;
  }
  if (!result.ok) {
    await giveBack();
    throw modelRefusal(result.reason);
  }
  const parsed = foundTripsAnswer.safeParse(jsonObjectIn(result.text));
  const saved = await db.forOrg(organizationId, async (tx) => {
    const trips: FoundTrip[] = [];
    for (const one of parsed.success ? parsed.data.trips : []) {
      if (trips.length === MAX_FOUND_TRIPS) break;
      if (one === null) continue;
      const evidence = resolveTokens(one.lines, part.pieces);
      // A trip no real line describes is not a trip.
      if (evidence.length === 0) continue;
      const destination = await destinationOf(tx, one.place);
      trips.push({
        ref: `trip-${String(trips.length + 1)}`,
        name: one.name,
        placeWords: one.place,
        destinationId: destination?.id ?? null,
        destinationName: destination?.name ?? null,
        nights: one.nights,
        evidence,
      });
    }
    // Nothing usable is not a call.
    if (trips.length === 0) {
      await releaseAiCall(tx, now, checked.timeZone);
      return null;
    }
    await recordTokens(tx, now, checked.timeZone, { input: result.inputTokens, output: result.outputTokens });
    // Per trip, a hash of its lines: drafting checks that the same tokens still name the same lines.
    const tripHash = (trip: FoundTrip) => linesHash(trip.evidence);
    const row = await tx.aiFill.create({
      data: {
        target: "package_draft",
        subjectType: "organization",
        subjectId: organizationId,
        requestedBy: access.userId,
        inputKind: "text",
        model: result.model,
        proposalHash: hashOf(trips.map(tripHash).join(",")),
        fields: trips.map((trip) => trip.ref),
        fieldHashes: Object.fromEntries(trips.map((trip) => [trip.ref, tripHash(trip)])),
      },
      select: { id: true },
    });
    return { fillId: row.id, trips, parts: parts.length > 1 ? offered : [], readPart: part.ref };
  });
  if (saved === null) throw nothing();
  return saved;
}
