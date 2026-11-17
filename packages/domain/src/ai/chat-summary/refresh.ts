// Writes the chat's summary afresh when more than 30 messages follow its point: the previous notes plus those messages
// in, new notes out, one counted model call. A failed refresh keeps the old summary and point; the turn goes on.
import type { Database } from "@travel-crm/db";
import type { AiPrompts } from "@travel-crm/integrations/prompts";
import type { Identity } from "../../identity/index.js";
import type { CalendarDate } from "../../kernel/index.js";
import { withTeamNames } from "../natural/chat-lines.js";
import { lineWords, stampOf } from "../natural/context/chat-turns.js";
import { leadBlock } from "../natural/context/turn-block.js";
import { cutText } from "../natural/context/tokens.js";
import type { LoopIO } from "../natural/loop/types.js";
import type { NaturalChatLine, NaturalLeadView } from "../natural/types.js";
import { oneLine } from "../lite/context/blocks.js";
import { countAfter, linesAfter, SUMMARY_AFTER } from "./lines.js";
import { renderSummaryPrompt, summaryPromptOf } from "./prompt.js";

const SUMMARY_MOST_CHARACTERS = 4_000;

export interface ChatSummary {
  text: string;
  throughId: string | null;
  throughAt: Date | null;
}

export type SummaryStep =
  | { kind: "kept"; summary: ChatSummary }
  | { kind: "refreshed"; summary: ChatSummary }
  | { kind: "failed"; summary: ChatSummary; reason: string };

interface Clock {
  today: CalendarDate;
  timeZone: string;
}

const speakers: Record<NaturalChatLine["from"], string> = {
  customer: "Customer",
  team: "Team",
  you: "AI",
  earlier: "Earlier system",
  automatic: "Automatic",
};

/** A line as the summary reads it: who, when, and everything it says, with what was heard or seen in a saved file. */
function summaryLine(line: NaturalChatLine, clock: Clock): string {
  const said =
    line.aiText === undefined
      ? ""
      : ` ${line.aiText.kind === "transcript" ? "heard" : "seen"}: "${oneLine(line.aiText.text)}"`;
  const words = lineWords(line, Number.POSITIVE_INFINITY, { earlierWhole: true });
  const who = line.from === "team" && line.teamName !== undefined ? `Team (${line.teamName})` : speakers[line.from];
  return `${who}, ${stampOf(line.at, clock)}: ${words}${said}`;
}

export async function refreshChatSummary(
  deps: { db: Database; call: LoopIO["call"]; prompts?: AiPrompts; identity?: Pick<Identity, "memberContacts"> },
  input: {
    organizationId: string;
    conversationId: string;
    agencyName: string;
    lead: NaturalLeadView;
    clock: Clock;
    now: Date;
  },
): Promise<SummaryStep> {
  let old: ChatSummary = { text: "", throughId: null, throughAt: null };
  // A failed refresh, a database error included, never blocks the turn: it goes on with the summary it had.
  try {
    return await refresh(deps, input, (summary) => (old = summary));
  } catch {
    return { kind: "failed", summary: old, reason: "error" };
  }
}

async function refresh(
  deps: Parameters<typeof refreshChatSummary>[0],
  input: Parameters<typeof refreshChatSummary>[1],
  setOld: (summary: ChatSummary) => ChatSummary,
): Promise<SummaryStep> {
  const { organizationId, conversationId, clock } = input;
  const read = await deps.db.forOrg(organizationId, async (tx) => {
    const chat = await tx.aiChat.findUnique({
      where: { organizationId_conversationId: { organizationId, conversationId } },
      select: { chatSummary: true, chatSummaryThroughId: true, chatSummaryThroughAt: true, summary: true },
    });
    const through =
      chat?.chatSummaryThroughAt != null && chat.chatSummaryThroughId !== null
        ? { at: chat.chatSummaryThroughAt, id: chat.chatSummaryThroughId }
        : null;
    const count = await countAfter(tx, conversationId, through);
    const read = count > SUMMARY_AFTER ? await linesAfter(tx, conversationId, through) : null;
    return { chat, through, read };
  });
  const old = setOld({
    text: read.chat?.chatSummary ?? "",
    throughId: read.through?.id ?? null,
    throughAt: read.through?.at ?? null,
  });
  if (read.read === null || read.read.lines.length === 0) return { kind: "kept", summary: old };
  const { senders } = read.read;
  const userIds = [...new Set(senders.values())];
  const contacts =
    deps.identity === undefined || userIds.length === 0
      ? []
      : await deps.identity.memberContacts(organizationId, userIds);
  const lines = withTeamNames(read.read.lines, senders, contacts);
  const newest = lines.at(-1);
  if (newest === undefined) return { kind: "kept", summary: old };

  // With no point yet, lite's notes are the first previous summary (spec 9).
  const previous = (read.through === null ? read.chat?.summary : read.chat?.chatSummary) ?? "";
  const prompt = await summaryPromptOf(deps.prompts);
  const user =
    `Previous notes:\n${previous.trim() === "" ? "none" : previous}\n\n` +
    `Messages since, oldest first:\n${lines.map((line) => summaryLine(line, clock)).join("\n")}\n\n` +
    `The lead card now:\n${leadBlock({ lead: input.lead, ...clock }, () => undefined)}`;
  const answer = await deps.call({
    feature: "sales_agent",
    messages: [
      { role: "system", content: renderSummaryPrompt(prompt, input.agencyName) },
      { role: "user", content: user },
    ],
    maxTokens: 1_500,
    reasoning: { effort: "minimal" },
    timeoutMs: 60_000,
    user: organizationId,
  });
  if (!answer.ok) return { kind: "failed", summary: old, reason: answer.reason };
  const text = cutText(answer.text.trim(), SUMMARY_MOST_CHARACTERS);
  if (text === "") return { kind: "failed", summary: old, reason: "empty" };

  // The point only moves forward, by (time, id): a refresh that lost a race leaves the later point in place.
  await deps.db.forOrg(organizationId, async (tx) => {
    await tx.aiChat.createMany({ data: [{ conversationId }], skipDuplicates: true });
    await tx.aiChat.updateMany({
      where: {
        conversationId,
        OR: [
          { chatSummaryThroughAt: null },
          { chatSummaryThroughAt: { lt: newest.at } },
          { chatSummaryThroughAt: newest.at, chatSummaryThroughId: { lt: newest.id } },
        ],
      },
      data: {
        chatSummary: text,
        chatSummaryThroughId: newest.id,
        chatSummaryThroughAt: newest.at,
        chatSummaryAt: input.now,
      },
    });
  });
  return { kind: "refreshed", summary: { text, throughId: newest.id, throughAt: newest.at } };
}
