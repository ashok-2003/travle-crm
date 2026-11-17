// The natural turn's tasks for the team (plan 2, ruling 15): the model's create_task and the fallback's question, each
// for one person, the lead's owner, else the first member holding leads:assign; due in 2 working hours, a call-back at
// the time asked. A second open question on the lead joins the AI's open question task rather than adding another. A
// title holds 200 characters: a longer text is cut at a word and points to an AI note on the lead holding it whole, so
// nothing the customer asked, nor what the AI left undone, is lost.
import type { NaturalTaskKind } from "@travel-crm/contracts/ai";
import { isOpenStage } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import { addAiLeadNote, lockLead, recordLeadEvent } from "../../crm/index.js";
import { uuidFromKey } from "../../jobs/index.js";
import { addWorkingMinutes, DomainError, systemActor, type Actor } from "../../kernel/index.js";
import { createTask, retitleTask } from "../../tasks/index.js";
import { stagedOf, type NaturalActDeps, type NaturalActInput } from "./act-types.js";
import { cutText } from "./context/tokens.js";

/** A task's title holds 200 characters (task_title_length), though the model's text may hold 500. */
const TITLE_MAX = 200;
/** Ends a title whose whole text is in the lead's note. */
const POINTER = " (details in the lead's note)";
const DUE_IN_WORKING_MINUTES = 120;
/** How the lead's note names the text it holds. */
const noteHeads: Record<NaturalTaskKind, string> = { question: "Question for the team", call_back: "Call back" };

interface TurnTask {
  kind: NaturalTaskKind;
  text: string;
  callAt: Date | null;
}

/** The turn's tasks: the model's, then the fallback's. */
function tasksOf(input: NaturalActInput): TurnTask[] {
  const staged = stagedOf(input.staged, "create_task");
  return [
    ...(staged === null ? [] : [{ kind: staged.kind, text: staged.text.trim(), callAt: staged.callAt }]),
    ...(input.task === null ? [] : [{ ...input.task, text: input.task.text.trim(), callAt: null }]),
  ].filter((task) => task.text !== "");
}

/** A title for the text: whole when it fits, else cut at a word, pointing to the lead's note when there is one. */
const titleOf = (text: string, noted: boolean) =>
  text.length <= TITLE_MAX || !noted
    ? cutText(text, TITLE_MAX)
    : `${cutText(text, TITLE_MAX - POINTER.length)}${POINTER}`;

/** A new title for the open task; false when staff closed it meanwhile, and the text needs a task of its own. */
async function retitled(tx: OrgTx, actor: Actor, taskId: string, title: string): Promise<boolean> {
  try {
    await retitleTask(tx, actor, taskId, title);
    return true;
  } catch (error) {
    if (error instanceof DomainError && error.reason === "TASK_CLOSED") return false;
    throw error;
  }
}

/**
 * Joins a question to the AI's open question task on the lead: in its title while it fits, else in a note on the lead
 * that the title points to. False when no such task is open, and the question needs a task of its own.
 */
async function joinQuestion(tx: OrgTx, actor: Actor, leadId: string, text: string): Promise<boolean> {
  const open = await tx.task.findFirst({
    where: { recordType: "lead", recordId: leadId, byAi: true, kind: "task", doneAt: null, cancelledAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, title: true },
  });
  if (open === null) return false;
  // Joined already: the turn's job ran again.
  if (open.title.includes(text)) return true;
  const joined = `${open.title}\n— ${text}`;
  if (joined.length <= TITLE_MAX) return retitled(tx, actor, open.id, joined);
  const pointer = `${cutText(open.title, TITLE_MAX - POINTER.length)}${POINTER}`;
  const pointing = open.title.endsWith(POINTER) || (await retitled(tx, actor, open.id, pointer));
  if (pointing) await addAiLeadNote(tx, actor, leadId, `${noteHeads.question}: ${text}`);
  return pointing;
}

/** Adds the turn's `index`th task, or joins a question to the AI's open one. Returns its code. */
async function addTask(
  tx: OrgTx,
  deps: NaturalActDeps,
  input: NaturalActInput,
  leadId: string | null,
  task: TurnTask & { index: number },
): Promise<string> {
  const actor = systemActor(input.organizationId);
  // A repeat of a turn that sent nothing ("already" keys on messages) finds the task it made.
  const id = uuidFromKey(`ai-task:${input.token}:${String(task.index)}`);
  if ((await tx.task.findUnique({ where: { id }, select: { id: true } })) !== null) return `task:${task.kind}`;
  // Read under the lead's lock: a reassign that committed while the model worked decides the owner, and a lead closed
  // meanwhile takes no new task of the AI's (R29); its task stands alone instead.
  const locked = leadId === null ? null : await lockLead(tx, leadId);
  const lead = locked !== null && leadId !== null && isOpenStage(locked.stage) ? leadId : null;
  if (lead !== null && task.kind === "question" && (await joinQuestion(tx, actor, lead, task.text)))
    return "task:joined";
  if (lead !== null && task.text.length > TITLE_MAX) {
    await addAiLeadNote(tx, actor, lead, `${noteHeads[task.kind]}: ${task.text}`);
  }
  const created = await createTask(tx, actor, {
    id,
    kind: task.kind === "call_back" ? "follow-up" : "task",
    title: titleOf(task.text, lead !== null),
    dueAt: task.callAt ?? addWorkingMinutes(input.now, DUE_IN_WORKING_MINUTES, deps.workingHours, input.timeZone),
    assigneeUserId: locked?.ownerUserId ?? deps.taskOwner,
    record: lead === null ? null : { recordType: "lead", recordId: lead },
    byAi: true,
  });
  if (lead !== null) {
    const record = { recordType: "task", recordId: created.id } as const;
    await recordLeadEvent(tx, actor, { leadId: lead, kind: "follow-up-added", record, occurredAt: input.now });
  }
  return `task:${task.kind}`;
}

/** The turn's tasks, on the lead while it is open (else standing alone, for the member holding leads:assign). */
export async function addTurnTasks(
  tx: OrgTx,
  deps: NaturalActDeps,
  input: NaturalActInput,
  leadId: string | null,
): Promise<string[]> {
  const codes: string[] = [];
  for (const [index, task] of tasksOf(input).entries()) {
    codes.push(await addTask(tx, deps, input, leadId, { ...task, index }));
  }
  return codes;
}
