// The natural agent's last try (plan 2, Task 8): its model failed twice, so no model is asked. The customer gets the
// fallback line, in their language, and the team a question task holding what the customer wrote; a long text goes to the
// lead's note (act-task.ts), and a returning customer with no open lead gets one first (F1). The AI stays on.
import { randomUUID } from "node:crypto";
import type { LiteDependencies, LiteOutcome, LiteTurnInput } from "../lite/types.js";
import { PAYMENT_PHOTO_TASK } from "../one/before-the-model.js";
import { newLinesOf } from "./context/chat-turns.js";
import { fallbackLine } from "./fallback-line.js";
import { prepareNaturalTurn } from "./prepare.js";
import type { LiveTurn } from "./turn-act.js";
import { actAndSettle } from "./turn-done.js";

/** The fallback line and a team task, with no model call. `now` is the act's clock for the chat's last reply (M3). */
export async function runNaturalFallback(
  deps: LiteDependencies,
  input: LiteTurnInput,
  now: Date,
): Promise<LiteOutcome> {
  const prepared = await prepareNaturalTurn(deps, input, now);
  if (typeof prepared === "string") return prepared;
  const lastTurnAt = prepared.facts.lastTurnAt === null ? null : new Date(prepared.facts.lastTurnAt);
  const newLines = newLinesOf(prepared.lines, lastTurnAt);
  const wrote = newLines
    .map((line) => line.text.trim())
    .filter((text) => text !== "")
    .join(" / ");
  // At the day's cap or a full month the line goes with code's hand-over, as in the live turn (ruling 5): never silence.
  const limit = prepared.monthFull
    ? { reason: "month_limit", summary: "" }
    : prepared.repliesToday >= prepared.dayCap
      ? { reason: "day_cap", summary: "" }
      : null;
  // A payment photo has no words: the team's task still names it, as the live turn's does.
  const payment = newLines.some((line) => line.mayBePayment === true) ? ` Also: ${PAYMENT_PHOTO_TASK}` : "";
  const turn: LiveTurn = { deps, input, now, prepared, traceId: randomUUID(), actions: [] };
  const done = await actAndSettle(turn, {
    messages: [fallbackLine(wrote)],
    staged: new Map(),
    quoted: [],
    handOver: limit,
    task: {
      kind: "question",
      text:
        wrote === ""
          ? `The AI couldn't answer the customer's last message (no words in it). Please reply.${payment}`
          : `The AI couldn't answer, so the customer got a holding line. They wrote: ${wrote}${payment}`,
    },
    model: null,
    fallback: "model_failed",
  });
  deps.logger?.info(
    { outcome: done.outcome, reason: done.reason, actions: done.actions, kind: input.kind },
    "The natural agent's fallback",
  );
  return done.outcome;
}
