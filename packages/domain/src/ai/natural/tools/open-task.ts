// No second open task for the same thing (the owner, 2026-11-25: the AI made one call-back task three times in ten
// minutes): a call-back while the AI's own call-back is open, or a question the AI's open question task already holds
// in the same or nearly the same words, is refused with a sentence the model can act on. A different question still
// joins the open one (act-task.ts).
import type { NaturalTaskKind } from "@travel-crm/contracts/ai";
import { wordsOf } from "../../lite/read-words.js";
import { stampOf, type ChatClock } from "../context/chat-turns.js";
import type { OpenTaskView } from "../types.js";
import type { Refused } from "./quote.js";

/** How alike two questions' words must be (Dice's coefficient on their sets of words) to be the same question. */
const SAME_QUESTION = 0.8;
/** How act-task.ts joins a question to the open task's title, and ends a title whose whole text is in a note. */
const JOINED = "\n— ";
const POINTER = " (details in the lead's note)";

/** Whether two questions say the same thing: the same words, give or take a word or two in a long one. */
export function sameQuestion(one: string, other: string): boolean {
  const a = new Set(wordsOf(one));
  const b = new Set(wordsOf(other));
  if (a.size === 0 || b.size === 0) return false;
  const shared = [...a].filter((word) => b.has(word)).length;
  return (2 * shared) / (a.size + b.size) >= SAME_QUESTION;
}

/** The questions an open question task holds: its title, split where act-task.ts joined later ones. */
const questionsOf = (title: string) =>
  (title.endsWith(POINTER) ? title.slice(0, -POINTER.length) : title).split(JOINED);

/** The refusal of a task the team already has open from the AI, or null when this one is new. */
export function openTaskRefusal(
  openTasks: readonly OpenTaskView[],
  task: { kind: NaturalTaskKind; text: string },
  clock: Omit<ChatClock, "now">,
): Refused | null {
  const open = openTasks.find(
    (one) =>
      one.aiKind === task.kind &&
      (task.kind === "call_back" || questionsOf(one.text).some((asked) => sameQuestion(asked, task.text))),
  );
  if (open === undefined) return null;
  const made = open.createdAt === null ? "" : ` (created ${stampOf(open.createdAt, clock)})`;
  return {
    refused:
      task.kind === "call_back"
        ? `refused: the team already has an open call-back task for this customer${made}; don't create another, just ` +
          "tell them the team has it (a new time they asked for goes in add_note)"
        : `refused: the team already has this question open for this customer${made}; don't create another, just ` +
          "tell them the team has it",
  };
}
