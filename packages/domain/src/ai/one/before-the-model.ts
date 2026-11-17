// What the one agent's turn does before the model (owner, 2026-11-17): a likely payment photo gives the team a task and
// the agent a notice; the agent keeps its tools and chats on. Natural's forced hand-over and no-tools call are not used.
import type { TurnAct } from "../natural/turn-act.js";
import type { NaturalChatLine, StagedAction } from "../natural/types.js";

export const PAYMENT_PHOTO_TASK = "A photo came in while a booking waits for payment: check it in Payments.";
export const PAYMENT_PHOTO_NOTICE =
  "A photo came in while their booking waits for payment; the team will check it. You may look at it, but never say the money arrived.";

/** Ruling MD5: all tools, always; a likely payment adds code's task and the notice; nothing forced. */
export function oneBeforeTheModel(newLines: readonly NaturalChatLine[]): {
  notice: string | null;
  forced: StagedAction[];
  task: { kind: "question"; text: string } | null;
} {
  const payment = newLines.some((line) => line.mayBePayment === true);
  return {
    notice: payment ? PAYMENT_PHOTO_NOTICE : null,
    forced: [],
    task: payment ? { kind: "question", text: PAYMENT_PHOTO_TASK } : null,
  };
}

export type PaymentTask = { kind: "question"; text: string } | null;

/** A reply's act takes code's payment task; an act with a task already, a fallback's, has it added to its text. */
export function withPaymentTask(act: TurnAct, task: PaymentTask): TurnAct {
  if (task === null) return act;
  return { ...act, task: act.task === null ? task : { ...act.task, text: `${act.task.text} Also: ${task.text}` } };
}
