// The live natural turn's act (plan 2, Task 6): a returning customer's lead opened first when an action needs one (in its
// own transaction, as lite opens it), what the act needs read before its transaction (whom to tell of a booking, the
// plan's storage, who takes a task and when it falls due, each only when the turn needs it), then the act in one
// transaction. A refusal that means this turn is no longer the one to answer ends it quietly; any other rolls it back,
// tells the team and ends `blocked`. A booking the act refused comes back as it is, for ruling 7.
import {
  DEFAULT_CLOSES_MINUTE,
  DEFAULT_OPENS_MINUTE,
  MONDAY_TO_SATURDAY,
  type AssignmentSettings,
} from "@travel-crm/contracts/crm";
import type { NaturalTaskKind } from "@travel-crm/contracts/ai";
import { readAssignment } from "../../crm/index.js";
import { DomainError, type WorkingHours } from "../../kernel/index.js";
import { flagChat } from "../lite/flag-chat.js";
import { openLeadForChat } from "../lite/open-lead.js";
import type { LiteDependencies, LiteOutcome, LiteTurnInput } from "../lite/types.js";
import { actOnNaturalTurn, type NaturalActDeps, type NaturalActResult } from "./act.js";
import type { NaturalPrepared } from "./prepare.js";
import type { QuoteFigures, StagedAction, StagedSet } from "./types.js";

/** One live turn, as its steps share it. */
export interface LiveTurn {
  deps: LiteDependencies;
  input: LiteTurnInput;
  now: Date;
  prepared: NaturalPrepared;
  /** The id the act's input carries for the turn's trace. */
  traceId: string;
  /** What the turn did beside the act ("lead:opened"), for its trace. */
  actions: string[];
}

/** What the act is asked to do: the words and the staged actions, code's hand-over or the fallback's task. */
export interface TurnAct {
  messages: string[];
  staged: StagedSet;
  quoted: QuoteFigures[];
  handOver: { reason: string; summary: string } | null;
  task: { kind: NaturalTaskKind; text: string } | null;
  model: string | null;
  /** Why the words are the fallback line (the loop's reason, a refused booking's), or null. */
  fallback: string | null;
}

export type Acted = Extract<NaturalActResult, { sentIds: string[] }>;
/** How the act ended: it acted, the booking was refused and rolled back, or the turn ends with an outcome. */
export type ActEnd = Acted | { refused: string; message: string } | { ended: LiteOutcome; reason: string | null };

/** The actions that work on the lead or a trip: a returning customer with no open lead gets one first. */
const LEAD_ACTIONS: readonly StagedAction["tool"][] = [
  "update_lead",
  "send_brochure",
  "offer_booking",
  "book",
  "resend_payment",
  "add_note",
  "create_task",
];
export const MONEY_ACTIONS: readonly StagedAction["tool"][] = ["book", "resend_payment"];
/** The act's own refusals that mean another turn, a person or a pause has the chat: nothing went, and nobody is told. */
const GIVEN_WAY = new Map([
  ["AGENT_PAUSED", "paused"],
  ["NEWER_MESSAGE", "superseded"],
  ["AGENT_STOPPED", "stopped"],
]);
/** The hours a task would fall due in, when the turn makes none: never read. */
const UNREAD_HOURS: WorkingHours = {
  workdays: MONDAY_TO_SATURDAY,
  opensMinute: DEFAULT_OPENS_MINUTE,
  closesMinute: DEFAULT_CLOSES_MINUTE,
};

const has = (staged: StagedSet, tools: readonly StagedAction["tool"][]) => tools.some((tool) => staged.has(tool));

/** A returning customer's new lead, opened before anything is sent; or why the turn ends instead. A task needs one too (F1). */
async function leadFor(turn: LiveTurn, act: TurnAct): Promise<ActEnd | null> {
  const { deps, input, prepared } = turn;
  // F1: a question task or a code hand-over (the fallback, a cap) needs a lead to stand on, like a staged action does.
  const needsLead = has(act.staged, LEAD_ACTIONS) || act.task !== null || act.handOver !== null;
  if (prepared.leadId !== null || !needsLead) return null;
  const { id, personId, phoneE164 } = prepared.chat;
  const opening = await openLeadForChat(deps, input.organizationId, { id, personId, phoneE164 }, turn.now);
  // No automation answers a blocked contact; a customer a person marked Not a lead gets no new lead, and no answer.
  if (opening === "blocked") return { ended: "blocked_contact", reason: null };
  if (opening === "not_a_lead") return { ended: "not_a_lead", reason: null };
  // Unable (no person, or the agency can't bring in leads): the act still answers; a task then stands alone.
  turn.actions.push(opening === "opened" ? "lead:opened" : "lead:unable");
  return null;
}

/** Who takes a task on a lead nobody owns (ruling 15): the first member, by name, holding leads:assign. */
async function taskOwnerOf(deps: LiteDependencies, organizationId: string): Promise<string | null> {
  const { identity } = deps;
  if (identity === undefined) return null;
  const holders = await identity.membersHolding(organizationId, "leads:assign");
  if (holders.length === 0) return null;
  const contacts = await identity.memberContacts(organizationId, holders);
  const [first] = [...contacts].sort((one, other) => one.name.localeCompare(other.name));
  return first?.userId ?? holders[0] ?? null;
}

const hoursOf = (settings: AssignmentSettings): WorkingHours => ({
  workdays: settings.workdays,
  opensMinute: settings.opensMinute,
  closesMinute: settings.closesMinute,
});

/** What the act needs that its transaction can't read (each read runs its own queries), read only when it is needed. */
async function actDepsOf(turn: LiveTurn, act: TurnAct): Promise<NaturalActDeps> {
  const { deps, input, prepared } = turn;
  const { organizationId } = input;
  const money = has(act.staged, MONEY_ACTIONS);
  const copiesFiles = money || act.staged.has("send_brochure");
  const tasks = act.task !== null || act.staged.has("create_task");
  const managers = money ? await deps.managers(organizationId) : [];
  const storageLimitBytes =
    copiesFiles && deps.subscriptions !== undefined
      ? ((await deps.subscriptions.entitlementsOf(organizationId))?.limits.storageBytes ?? null)
      : null;
  return {
    files: deps.files,
    recipients: () => Promise.resolve(managers),
    storageLimitBytes,
    supplierStateCode: prepared.supplierStateCode,
    taskOwner: tasks ? await taskOwnerOf(deps, organizationId) : null,
    workingHours: tasks ? hoursOf(await deps.db.forOrg(organizationId, (tx) => readAssignment(tx))) : UNREAD_HOURS,
  };
}

export async function actOnTurn(turn: LiveTurn, act: TurnAct): Promise<ActEnd> {
  const instead = await leadFor(turn, act);
  if (instead !== null) return instead;
  const { deps, input, prepared, now } = turn;
  const actDeps = await actDepsOf(turn, act);
  try {
    const result = await deps.db.forOrg(input.organizationId, (tx) =>
      actOnNaturalTurn(tx, actDeps, {
        ...input,
        now,
        timeZone: prepared.timeZone,
        today: prepared.today,
        messages: act.messages,
        staged: act.staged,
        quoted: act.quoted,
        facts: prepared.facts,
        sheets: prepared.sheets,
        typed: prepared.typed,
        handOver: act.handOver,
        task: act.task,
        traceId: turn.traceId,
        model: act.model,
        agencyName: prepared.voice.agencyName,
      }),
    );
    // This turn's messages went already: its job ran again.
    if (result === "already") return { ended: "answered", reason: null };
    // A person replied or took the chat over, a switch went off, or the day's cap: nothing was written.
    if ("stopped" in result) return { ended: result.stopped, reason: null };
    return result;
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    const gaveWay = GIVEN_WAY.get(error.reason);
    if (gaveWay !== undefined) return { ended: gaveWay, reason: null };
    // Anything else rolled the turn back: nothing went, and the team hears of it, by code.
    const code = error.reason;
    await flagChat(deps.db, {
      organizationId: input.organizationId,
      chat: prepared.chat,
      token: input.token,
      code,
      now,
    });
    return { ended: "blocked", reason: code };
  }
}
