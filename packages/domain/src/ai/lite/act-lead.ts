// What a lite turn leaves on the lead: the trip fields the chat settled (marked as the AI's), the customer's own name in
// place of a WhatsApp stand-in, the stage moved forward, a note, a follow-up for the owner, and the lead's score. Act
// calls it with the chat's row already locked, so each lead lock here comes second, as on the inbound path.
import type { OrgTx } from "@travel-crm/db";
import { addAiFollowUp, addAiLeadNote, advanceLeadStage, renameWhatsAppPerson } from "../../crm/index.js";
import { formatRupees, formatShortDay, systemActor } from "../../kernel/index.js";
import { saveLeadInsight } from "../insight.js";
import type { LiteActInput } from "./act-types.js";
import { followUps, noteWords } from "./act-words.js";
import { usableName } from "./decide/stage.js";
import { travellersWords } from "./fixed-texts.js";
import { liteInsightOf, writeLeadFromFacts } from "./lead-writes.js";
import type { Decision, DepartureLine, SituationPackage } from "./types.js";

type LeadInput = LiteActInput & { decision: Decision };

export interface ChatPerson {
  personId: string | null;
  phoneE164: string;
  profileName: string | null;
}

const monthWords = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

/** The facts' package and departure as the situation read them; null for one it did not read. */
function chosenOf(input: LeadInput): { pkg: SituationPackage | null; departure: DepartureLine | null } {
  const { facts } = input.decision;
  const { package: read, price } = input.situation;
  const pkg = read?.id === facts.packageId ? read : null;
  const priced = price?.packageId === facts.packageId ? price.departure : null;
  const departure =
    pkg?.departures.find((one) => one.id === facts.departureId) ?? (priced?.id === facts.departureId ? priced : null);
  return { pkg, departure };
}

function noteOf(input: LeadInput, pkg: SituationPackage | null, departure: DepartureLine | null): string | null {
  const { note, move, facts } = input.decision;
  if (note === "package_picked") return pkg === null ? null : noteWords.packagePicked(pkg.title);
  if (note === "quoted") {
    const told = facts.quoted;
    if (told === null || pkg === null || departure === null || facts.adults === null) return null;
    return noteWords.quoted({
      package: pkg.title,
      date: formatShortDay(departure.startsOn, input.today),
      travellers: travellersWords(facts.adults, facts.children?.count ?? 0, "english"),
      total: formatRupees(told.totalPaise),
      advance: formatRupees(told.advancePaise),
    });
  }
  if (note === "handed_over") return move.kind === "hand_over" ? noteWords.handedOver(move.reason) : null;
  if (note === "not_interested") return noteWords.notInterested;
  if (note === "later") return noteWords.later;
  return null;
}

/** The score row's facts in words: the trip, when, and the party. */
function insightFacts(input: LeadInput, pkg: SituationPackage | null, departure: DepartureLine | null) {
  const { facts } = input.decision;
  const when =
    departure !== null
      ? formatShortDay(departure.startsOn, input.today)
      : facts.month === null
        ? null
        : monthWords.format(new Date(`${facts.month}-01T00:00:00Z`));
  return {
    destination: pkg?.place ?? pkg?.title ?? null,
    when,
    travellers: facts.adults === null ? null : travellersWords(facts.adults, facts.children?.count ?? 0, "english"),
  };
}

/** Writes the turn on the lead. Returns codes of what changed. */
export async function writeOnLead(
  tx: OrgTx,
  input: LeadInput,
  lead: { id: string; personName: string },
  chat: ChatPerson,
): Promise<string[]> {
  const { organizationId, decision, now, checked } = input;
  const { facts } = decision;
  const actor = systemActor(organizationId);
  const { pkg, departure } = chosenOf(input);
  const codes: string[] = [];
  const fields = await writeLeadFromFacts(tx, {
    organizationId,
    leadId: lead.id,
    facts,
    pkg: pkg === null ? null : { destinationId: pkg.destinationId, nights: pkg.nights },
    departureStartsOn: departure?.startsOn ?? null,
    proofs: checked?.proofs ?? {},
    today: input.today,
  });
  codes.push(...fields.map((field) => `lead:${field}`));
  let name = lead.personName;
  const given = facts.name?.trim() ?? "";
  if (chat.personId !== null && given !== "" && given !== name && usableName(given, chat.phoneE164)) {
    // Only a WhatsApp stand-in or profile name is replaced; a name a person typed stays.
    const renamed = await renameWhatsAppPerson(tx, actor, {
      personId: chat.personId,
      leadId: lead.id,
      name: given,
      profileName: chat.profileName,
      phoneE164: chat.phoneE164,
    });
    if (renamed) {
      name = given;
      codes.push("name");
    }
  }
  const stage = decision.stageTo;
  if (stage !== null && (await advanceLeadStage(tx, actor, { leadId: lead.id, stage, byAi: true }, now))) {
    codes.push(`stage:${stage}`);
  }
  const note = noteOf(input, pkg, departure);
  if (note !== null && (await addAiLeadNote(tx, actor, lead.id, note))) codes.push(`note:${decision.note ?? ""}`);
  if (decision.task !== null) {
    const followUp = followUps[decision.task];
    const dueAt = new Date(now.getTime() + followUp.dueInMs);
    const task = await addAiFollowUp(tx, actor, { leadId: lead.id, title: followUp.title(name), dueAt }, now);
    if (task !== null) codes.push(`task:${decision.task}`);
  }
  if (checked !== null) {
    const insight = liteInsightOf(checked.form.score, insightFacts(input, pkg, departure), input.model ?? "");
    await saveLeadInsight(tx, organizationId, lead.id, insight);
    codes.push("insight");
  }
  return codes;
}
