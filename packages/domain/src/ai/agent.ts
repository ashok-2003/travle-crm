// The one WhatsApp agent's turn for a chat: the checks that stop it before any call (a server with no model, an agency whose
// plan or subscription has no AI, a pause by platform staff), then the lite turn, whatever an agency's older switches say.
// The turn itself, its gates and its writes are in lite/; a turn refused for an unfinished setup tells the managers.
import type { Database } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import type { Logger } from "@travel-crm/integrations/logging";
import type { Files } from "../files/index.js";
import type { Identity } from "../identity/index.js";
import { agentPauseOf, type SubscriptionAccess } from "../subscriptions/index.js";
import { aiAllowed } from "./allowed.js";
import type { BookingRecipients } from "./booking.js";
import { runLiteTurn } from "./lite/turn.js";
import type { LiteTurnInput, TraceSink } from "./lite/types.js";
import { AI_TOKEN_PREFIX, agentAnswers, mayWrite } from "./may-write.js";
import { tellAgentNotReady } from "./not-ready-notice.js";

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
  /** Who owns the agency's leads: the turn opens a returning customer's new lead with it. */
  identity?: Pick<Identity, "firstOwner" | "leadWorkers" | "organizationProfile">;
  /** The minute job's clock: a lite follow-up reads it again before it acts, so its checks hold when it sends. */
  clock?: () => Date;
}

/**
 * One turn of the AI in a chat: `reply` to the customer's last message, or `nudge` a quiet one. Returns what happened,
 * for the log. Safe to run twice: a reply's token is the message it answers.
 */
export async function runAgentTurn(dependencies: AgentDependencies, input: LiteTurnInput, now: Date): Promise<string> {
  if (!dependencies.ai.configured) return "not_configured";
  // No AI for an agency whose plan lacks it or whose subscription is read-only, suspended or cancelled.
  if (!aiAllowed(await dependencies.subscriptions.entitlementsOf(input.organizationId))) return "not_allowed";
  // Paused by platform staff: nothing is written to a customer. Read fresh, never from the access cache.
  const paused = await dependencies.db.forOrg(input.organizationId, (tx) => agentPauseOf(tx, input.organizationId));
  if (paused !== null) return "paused";
  const outcome = await runLiteTurn(dependencies, input, now);
  // Switched on, but its setup came undone: the customer got nothing, so the managers hear of it, once a day.
  if (outcome === "not_ready") await tellAgentNotReady(dependencies, input.organizationId, now);
  return outcome;
}
