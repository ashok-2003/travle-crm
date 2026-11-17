// The natural turn's tasks for the team (plan 2, ruling 15): the model's create_task and the fallback's question, each
// for one person, the lead's owner, else the first member holding leads:assign; due in 2 working hours, a call-back at
// the time asked. A second open question on the lead joins the AI's open question task rather than adding another.
import type { NaturalTaskKind } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { lockLead, recordLeadEvent } from "../../crm/index.js";
import { addWorkingMinutes, systemActor } from "../../kernel/index.js";
import { createTask, retitleTask } from "../../tasks/index.js";
import { stagedOf, type NaturalActDeps, type NaturalActInput } from "./act-types.js";
import { cutText } from "./context/tokens.js";

/** A task's title holds 200 characters (task_title_length), though the model's text may hold 500. */
const TITLE_MAX = 200;
const DUE_IN_WORKING_MINUTES = 120;

interface TurnTask {
  kind: NaturalTaskKind;
  text: string;
  callAt: Date | null;
}

/** The turn's tasks: the model's, then the fallback's. */
function tasksOf(input: NaturalActInput): TurnTask[] {
  const staged = stagedOf(input.staged, "create_task");
  return [
    ...(staged === null ? [] : [{ kind: staged.kind, text: staged.text, callAt: staged.callAt }]),
    ...(input.task === null ? [] : [{ ...input.task, callAt: null }]),
  ].filter((task) => task.text.trim() !== "");
}

/** Adds one task, or joins a question to the AI's open question on the lead. Returns its code. */
async function addTask(
  tx: OrgTx,
  deps: NaturalActDeps,
  input: NaturalActInput,
  leadId: string | null,
  task: TurnTask,
): Promise<string> {
  const actor = systemActor(input.organizationId);
  const text = task.text.trim();
  // Whose lead it is, read under its lock: a reassign that committed while the model worked decides it.
  const owner = leadId === null ? null : (await lockLead(tx, leadId)).ownerUserId;
  if (leadId !== null && task.kind === "question") {
    const open = await tx.task.findFirst({
      where: { recordType: "lead", recordId: leadId, byAi: true, kind: "task", doneAt: null, cancelledAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, title: true },
    });
    if (open !== null) {
      await retitleTask(tx, actor, open.id, cutText(`${open.title}\n— ${text}`, TITLE_MAX));
      return "task:joined";
    }
  }
  const dueAt = task.callAt ?? addWorkingMinutes(input.now, DUE_IN_WORKING_MINUTES, deps.workingHours, input.timeZone);
  const created = await createTask(tx, actor, {
    kind: task.kind === "call_back" ? "follow-up" : "task",
    title: cutText(text, TITLE_MAX),
    dueAt,
    assigneeUserId: owner ?? deps.taskOwner,
    record: leadId === null ? null : { recordType: "lead", recordId: leadId },
    byAi: true,
  });
  if (leadId !== null) {
    const record = { recordType: "task", recordId: created.id } as const;
    await recordLeadEvent(tx, actor, { leadId, kind: "follow-up-added", record, occurredAt: input.now });
  }
  return `task:${task.kind}`;
}

/** The turn's tasks, on the lead when it has one (else standing alone, for the member holding leads:assign). */
export async function addTurnTasks(
  tx: OrgTx,
  deps: NaturalActDeps,
  input: NaturalActInput,
  leadId: string | null,
): Promise<string[]> {
  const codes: string[] = [];
  for (const task of tasksOf(input)) codes.push(await addTask(tx, deps, input, leadId, task));
  return codes;
}
