// The WhatsApp agent's turn for a chat: the checks that stop it before any call (a server with no model, an agency whose
// plan or subscription has no AI, a pause by platform staff), then the turn of the agent the agency is on, read again in
// the pause's transaction at every turn: the natural agent's (natural/turn.ts, its own trace) or lite's, whatever an
// agency's older switches say. A turn refused for an unfinished setup tells the managers. With a tracing, a lite turn,
// and a turn the checks stopped, is one traced turn of its chat (lite/turn-notes.ts).
import type { Database } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import type { Logger } from "@travel-crm/integrations/logging";
import type { AiPrompts } from "@travel-crm/integrations/prompts";
import type { ToolAgent } from "@travel-crm/integrations/tool-agent";
import type { AiTracing } from "@travel-crm/integrations/tracing";
import type { Files } from "../files/index.js";
import type { Identity } from "../identity/index.js";
import { agentPauseOf, type SubscriptionAccess } from "../subscriptions/index.js";
import { agentOf } from "./agent-choice.js";
import { aiAllowed } from "./allowed.js";
import type { BookingRecipients } from "./booking.js";
import { runLiteTurn } from "./lite/turn.js";
import { notingSink, outcomeNote, turnStart } from "./lite/turn-notes.js";
import type { LiteTurnInput, TraceSink } from "./lite/types.js";
import { AI_TOKEN_PREFIX, agentAnswers, mayWrite } from "./may-write.js";
import { runNaturalFallback } from "./natural/turn-fallback.js";
import { runNaturalTurn } from "./natural/turn.js";
import { tellAgentNotReady } from "./not-ready-notice.js";
import { runOneTurn } from "./one/turn.js";
import type { ToolTurnSink } from "./traces/trace-sink.js";

export { AI_HANDOFF_KIND } from "./tell-owner.js";
export { AI_TOKEN_PREFIX, agentAnswers, mayWrite };

export interface AgentDependencies {
  db: Database;
  ai: AiModel;
  subscriptions: Pick<SubscriptionAccess, "entitlementsOf">;
  /** The agency's name, for the AI to speak for. */
  agencyName: (organizationId: string) => Promise<string>;
  /** Where the agency's files are kept, to send them. */
  files: Files;
  /** The agency's managers, told of every booking the AI takes. */
  managers: BookingRecipients;
  /** Where the turn logs its outcome (codes only); the worker passes its own. */
  logger?: Logger;
  /** Where the turn hands the whole of each turn it prepared (plan 3b keeps them); without one, none is kept. */
  traces?: TraceSink;
  /**
   * Who owns the agency's leads (the turn opens a returning customer's new lead with it), the team's names and who holds
   * a permission. Each call runs its own queries: never inside a transaction.
   */
  identity?: Pick<Identity, "firstOwner" | "leadWorkers" | "organizationProfile" | "memberContacts" | "membersHolding">;
  /** The minute job's clock: a lite follow-up reads it again before it acts, so its checks hold when it sends. */
  clock?: () => Date;
  /** Where each turn is traced (Langfuse), its model calls inside it; without one, nothing is. */
  tracing?: AiTracing;
  /** Langfuse's prompts: the natural agent runs on the prompt at label production; without them, its built-in text. */
  prompts?: AiPrompts;
  /** Runs the one agent's model and tools (LangGraph's in the worker); a server without one answers nothing for it. */
  toolAgent?: ToolAgent;
  /** Keeps each one turn as a row of ai_turn_trace; without one, none is kept. */
  toolTurns?: ToolTurnSink;
}

/**
 * One turn of the AI in a chat: `reply` to the customer's last message, or `nudge` a quiet one. Returns what happened,
 * for the log. Safe to run twice: a reply's token is the message it answers.
 */
export async function runAgentTurn(dependencies: AgentDependencies, input: LiteTurnInput, now: Date): Promise<string> {
  const checked = await agentChecked(dependencies, input);
  const { toolAgent } = dependencies;
  const outcome =
    checked === "one"
      ? toolAgent === undefined
        ? "not_configured"
        : await runOneTurn({ ...dependencies, toolAgent }, input, now)
      : checked === "natural"
        ? await runNaturalTurn(dependencies, input, now)
        : await tracedLite(dependencies, input, (traced) =>
            checked === "lite" ? runLiteTurn(traced, input, now) : Promise.resolve(checked),
          );
  // Switched on, but its setup came undone: the customer got nothing, so the managers hear of it, once a day.
  if (outcome === "not_ready") await tellAgentNotReady(dependencies, input.organizationId, now);
  return outcome;
}

/**
 * The last try of a natural or one turn whose model failed twice: the fallback line and a task for the team, with no model call,
 * through the same checks as a turn. Lite has no such try.
 */
export async function runAgentFallback(
  dependencies: AgentDependencies,
  input: LiteTurnInput,
  now: Date,
): Promise<string> {
  const checked = await agentChecked(dependencies, input);
  return checked === "natural" || checked === "one"
    ? runNaturalFallback(dependencies, input, now)
    : runAgentTurn(dependencies, input, now);
}

/** The agent that answers, or why none does: no model on this server, no AI on the plan, or paused by platform staff. */
async function agentChecked(
  dependencies: AgentDependencies,
  input: LiteTurnInput,
): Promise<"lite" | "natural" | "one" | "not_configured" | "not_allowed" | "paused"> {
  if (!dependencies.ai.configured) return "not_configured";
  // No AI for an agency whose plan lacks it or whose subscription is read-only, suspended or cancelled.
  if (!aiAllowed(await dependencies.subscriptions.entitlementsOf(input.organizationId))) return "not_allowed";
  // Paused by platform staff: nothing is written to a customer. Read fresh, never from the access cache, and the agent
  // with it: a change in the console applies to the next message.
  return dependencies.db.forOrg(input.organizationId, async (tx) =>
    (await agentPauseOf(tx, input.organizationId)) === null ? agentOf(tx) : "paused",
  );
}

/** A lite turn, or a turn the checks stopped, as one traced turn of its chat, its stored trace noted on it. */
function tracedLite(
  dependencies: AgentDependencies,
  input: LiteTurnInput,
  turn: (dependencies: AgentDependencies) => Promise<string>,
): Promise<string> {
  const { tracing } = dependencies;
  if (tracing === undefined) return turn(dependencies);
  return tracing.turn(turnStart(input), async () => {
    const traces = notingSink(tracing, dependencies.traces);
    const outcome = await turn({ ...dependencies, traces });
    if (!traces.noted) tracing.note(outcomeNote(outcome));
    return outcome;
  });
}
