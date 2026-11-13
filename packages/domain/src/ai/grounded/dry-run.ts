// "Test the AI" for an agency answering from its packages: the grounded turn as a dry run on one question (read, look up,
// write, fill, check), as if a customer with a lead wrote it in a new chat. Nothing is sent, no facts are kept and no
// booking is made; each model call counts against the month's limit, as a turn's do.
import { chatFacts, type TestAiAction, type WriteAnswer } from "@travel-crm/contracts/ai";
import type { Database } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import { organizationTimeZone, type MemberAccess } from "../../identity/index.js";
import { calendarDateIn, DomainError } from "../../kernel/index.js";
import { getOrganizationProfile } from "../../profile/index.js";
import { knowledgePack } from "../agent-context.js";
import { autopilotOf } from "../autopilot.js";
import { calendarText, dateChecks } from "../calendar.js";
import { activeLessons } from "../learning-store.js";
import { agencyVoiceOf } from "../voice.js";
import { allowedActions, chosenActions } from "./actions.js";
import { buildCard } from "./card.js";
import { lookUp } from "./lookup.js";
import { mergeFacts } from "./merge-facts.js";
import { aboutCustomer } from "./prompt.js";
import { readChat } from "./read.js";
import type { ChatLine } from "./read-keys.js";
import { countedCall, type CallEnvironment } from "../lite/counted-call.js";
import { newNotRunInAnotherScript } from "./turn-inputs.js";
import { readKeys } from "./turn-prepare.js";
import { replyContext, writeChecked } from "./turn-write.js";

export interface DryRun {
  answer: string;
  handoff: boolean;
  reason: string;
  grounded: { actions: TestAiAction[]; blocked: string | null };
}

/** A model that gave nothing usable: the month's limit, or the model being down. */
function ended(reason: string): never {
  if (reason === "limit")
    throw new DomainError("LIMIT_REACHED", "AI_LIMIT_REACHED", "This month's AI calls are used up");
  throw new DomainError("CONFLICT", "AI_UNAVAILABLE", "The AI did not answer; try again");
}

/** What code would do with the chosen actions, in the test box's words (the payment details and the booking are one). */
const actionsOf = (chosen: WriteAnswer["actions"]): TestAiAction[] => [
  ...(chosen.sendFiles.length > 0 ? (["files"] as const) : []),
  ...(chosen.sendAgencyFiles ? (["agencyFiles"] as const) : []),
  ...(chosen.sendPayment || chosen.requestBooking ? (["book"] as const) : []),
  ...(chosen.flag === null ? [] : (["flag"] as const)),
  ...(chosen.note === null ? [] : (["note"] as const)),
  ...(chosen.task === null ? [] : (["task"] as const)),
];

const blocked = (code: string): DryRun => ({
  answer: "",
  handoff: false,
  reason: "",
  grounded: { actions: [], blocked: code },
});

export async function groundedDryRun(
  deps: { db: Database; ai: AiModel; agencyName: (organizationId: string) => Promise<string> },
  access: MemberAccess,
  question: string,
  now: Date,
): Promise<DryRun> {
  const { db, ai } = deps;
  const { organizationId } = access;
  const transcript: ChatLine[] = [{ from: "customer", text: question }];
  const prepared = await db.forOrg(organizationId, async (tx) => {
    const settings = await autopilotOf(tx);
    const timeZone = await organizationTimeZone(tx, organizationId);
    const today = calendarDateIn(now, timeZone);
    return {
      settings,
      timeZone,
      today,
      keys: await readKeys(tx, organizationId, today),
      destinationNames: (await tx.destination.findMany({ select: { name: true } })).map((one) => one.name),
      knowledge: await knowledgePack(tx, aboutCustomer(transcript), { ownOnly: true }),
      learnings: settings.learning ? await activeLessons(tx) : [],
      voice: await agencyVoiceOf(tx),
      instructions: (await tx.aiSettings.findFirst({ select: { instructions: true } }))?.instructions ?? "",
      hasGstState: ((await getOrganizationProfile(tx, organizationId))?.gstStateCode ?? "") !== "",
    };
  });
  const environment: CallEnvironment = { db, organizationId, now, timeZone: prepared.timeZone };
  const empty = chatFacts.parse({});
  const asked = await countedCall(environment, () =>
    readChat(ai, { ...prepared.keys, transcript, facts: empty, timeZone: prepared.timeZone }),
  );
  if (!asked.ok) return asked.reason === "unfit" ? blocked("unfit") : ended(asked.reason);
  const { read } = asked;
  // The turn would hand the chat to a person here, and write nothing (the reason's words say so).
  if (newNotRunInAnotherScript(read, empty)) return blocked("not_run_script");
  const facts = mergeFacts(empty, read, prepared.keys);
  const nearest = read.nearest.flatMap((key) => prepared.keys.packages.find((one) => one.key === key)?.id ?? []);
  const lookup = await db.forOrg(organizationId, (tx) =>
    lookUp(tx, organizationId, facts, prepared.today, now, nearest),
  );
  const card = buildCard(lookup);
  const natural = prepared.settings.persona === "natural";
  const allowed = allowedActions(lookup, facts, read, {
    natural,
    hasLead: true,
    settings: prepared.settings,
    latest: [question],
    notRunBefore: [],
    hasGstState: prepared.hasGstState,
  });
  const written = await writeChecked(
    ai,
    environment,
    {
      settings: prepared.settings,
      agency: await deps.agencyName(organizationId),
      kind: "reply",
      pack: {
        knowledge: prepared.knowledge,
        learnings: prepared.learnings,
        voice: prepared.voice,
        natural,
        instructions: prepared.instructions,
        facts: "Nothing is known about this customer yet.",
        calendar: calendarText(now, prepared.timeZone),
        dateChecks: dateChecks(question, now, prepared.timeZone),
        followUp: null,
        card,
        allowed,
        wants: read.wants,
      },
      messages: [{ role: "user", content: question }],
    },
    card,
    replyContext(lookup, prepared.destinationNames, facts),
    [],
  );
  if (written.kind === "ended") return ended(written.outcome);
  if (written.kind !== "ok") return blocked(written.kind === "blocked" ? written.code : "repeat");
  const chosen = chosenActions(written.actions, allowed);
  return {
    answer: written.text,
    handoff: chosen.handOver !== null,
    reason: chosen.handOver ?? "",
    grounded: { actions: actionsOf(chosen), blocked: null },
  };
}
