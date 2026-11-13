// Whether the agency's AI agent answers chats at all, and in one chat: the one rule the inbox (its chat card and the bar
// over the reply box) and the worker's "the AI has the message" mark share, so the inbox never says the AI is answering
// a chat its turn will refuse. The turn checks the same switch and setup itself (lite/prepare.ts).
import type { OrgTx } from "@travel-crm/db";
import { organizationTimeZone } from "../identity/index.js";
import { calendarDateIn } from "../kernel/index.js";
import { agentSetupOf } from "./agent-setup.js";
import { autopilotOf } from "./autopilot.js";

/**
 * What the agency's agent does with its chats: answers them ("ready"), none because its switch is off ("off"), or none
 * until its setup is finished, or done again ("not_ready"). The AI module, the plan and a pause by platform staff are
 * read by the callers first: each of them hides the AI or stops the turn before this matters.
 */
export type AgentReach = "ready" | "off" | "not_ready";

export async function agentReachOf(tx: OrgTx, organizationId: string, now: Date): Promise<AgentReach> {
  if (!(await autopilotOf(tx)).autopilot) return "off";
  const today = calendarDateIn(now, await organizationTimeZone(tx, organizationId));
  return (await agentSetupOf(tx, organizationId, today)).ready ? "ready" : "not_ready";
}

type ChatSwitches = { mode: string; handedOffAt: Date | null } | null | undefined;

/** Whether the chat itself leaves room for the agent: it isn't switched off in the chat, and nobody took it over. */
export const chatOpenToAgent = (chat: ChatSwitches): boolean => chat?.mode !== "off" && chat?.handedOffAt == null;

/**
 * Whether the agent answers in this chat: the agency's agent is ready and the chat is open to it. A chat's own "On"
 * adds nothing to an agent that is off: the turn answers no chat then.
 */
export function answersInChat(reach: AgentReach, chat: ChatSwitches): boolean {
  return reach === "ready" && chatOpenToAgent(chat);
}
