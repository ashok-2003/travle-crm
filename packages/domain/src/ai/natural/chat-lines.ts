// The chat as the natural agent reads it live (spec 4.3, plan 2 rulings 2 and 3): who wrote each line (the customer,
// this agent, an earlier assistant, someone on the team or the agency's automation), a past action of ours as its
// bracketed words, and a voice note nobody could play. Team members are named after the transaction, from identity.
import { withoutAmountsAndDates } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import type { MemberContact } from "../../identity/index.js";
import { AI_TOKEN_PREFIX } from "../may-write.js";
import type { NaturalChatLine } from "./types.js";

/** Ruling 2: an AI line before this is an earlier assistant's (the one-agent release merged at 19:08 UTC that day). */
export const EARLIER_AGENTS_UNTIL = new Date("2026-11-13T21:00:00Z");
/** The newest lines a turn reads; the context keeps 40 of them. */
export const CHAT_READ = 60;

/** The payment details the earlier first agent sent, before the move to one agent. */
const EARLIER_PAYMENT_PREFIX = "ai-pay:";
const PERSON_ORIGINS = new Set(["staff_crm", "staff_phone"]);
const PAYMENT_DETAILS = "sent: payment details";

export const storedLineFields = {
  id: true,
  direction: true,
  origin: true,
  kind: true,
  body: true,
  caption: true,
  fileName: true,
  clientToken: true,
  sentBy: true,
  occurredAt: true,
  aiText: true,
  aiTextKind: true,
} as const;

export interface StoredLine {
  id: string;
  direction: string;
  origin: string;
  kind: string;
  body: string | null;
  caption: string | null;
  fileName: string | null;
  clientToken: string | null;
  sentBy: string | null;
  occurredAt: Date;
  aiText: string | null;
  aiTextKind: string | null;
}

const isAiToken = (token: string) => token.startsWith(AI_TOKEN_PREFIX) || token.startsWith(EARLIER_PAYMENT_PREFIX);

/** Ruling 3: a line of ours is this agent's or an earlier one's; a person's is the team's; anything else is automatic. */
function fromOf(row: StoredLine): NaturalChatLine["from"] {
  if (row.direction === "in") return "customer";
  if (isAiToken(row.clientToken ?? "")) return row.occurredAt < EARLIER_AGENTS_UNTIL ? "earlier" : "you";
  // A reply typed on the phone app has no member to name, but a person wrote it.
  return row.sentBy !== null || PERSON_ORIGINS.has(row.origin) ? "team" : "automatic";
}

/** An AI file as what it sent, and the payment lines and QR as one action: their words are the agency's, never the model's. */
function actionOf(row: StoredLine, from: NaturalChatLine["from"], earlierWhole: boolean): string | null {
  if (from !== "you" && from !== "earlier") return null;
  const token = row.clientToken ?? "";
  if (token.startsWith(EARLIER_PAYMENT_PREFIX) || token.endsWith(":pay") || token.endsWith(":qr")) {
    return PAYMENT_DETAILS;
  }
  if (row.kind === "text" || row.kind === "template") return null;
  const named = [row.caption, row.fileName].map((one) => one?.trim() ?? "").find((one) => one !== "") ?? "a file";
  // An earlier assistant's caption may hold its made-up figures, which its words never show either, unless asked.
  return `sent: ${from === "earlier" && !earlierWhole ? withoutAmountsAndDates(named) : named}`;
}

/** A stored message as a chat line; the summary reads its rows through this too. */
export function storedLineOf(row: StoredLine, options: { earlierWhole?: boolean } = {}): NaturalChatLine {
  const from = fromOf(row);
  const text = row.body ?? row.caption ?? "";
  const action = actionOf(row, from, options.earlierWhole === true);
  const kind = row.aiTextKind === "transcript" || row.aiTextKind === "description" ? row.aiTextKind : null;
  return {
    id: row.id,
    from,
    at: row.occurredAt,
    kind: row.kind,
    text,
    ...(row.fileName === null ? {} : { fileName: row.fileName }),
    ...(action === null ? {} : { action }),
    ...(row.aiText === null || kind === null ? {} : { aiText: { kind, text: row.aiText } }),
    ...(from === "customer" && row.kind === "audio" && text.trim() === "" ? { untranscribed: true } : {}),
  };
}

/**
 * The chat's newest 60 lines the customer could see, oldest first, reactions left out (a reaction on our message is no
 * line of its own), and for each team line a member wrote, that member's user id: identity names them after the
 * transaction. `earlierWhole` keeps an earlier assistant's file caption as it was written (the one agent reads its
 * predecessors' figures).
 */
export async function naturalChatLines(
  tx: OrgTx,
  conversationId: string,
  options: { earlierWhole?: boolean } = {},
): Promise<{ lines: NaturalChatLine[]; senders: ReadonlyMap<string, string> }> {
  const rows = await tx.whatsappMessage.findMany({
    // A discarded message or a cancelled broadcast's recalled send never reached the customer.
    where: { conversationId, kind: { not: "reaction" }, status: { not: "superseded" } },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: CHAT_READ,
    select: storedLineFields,
  });
  const lines = rows.reverse().map((row) => storedLineOf(row, options));
  const senders = new Map(
    rows.flatMap((row) => (row.direction === "out" && row.sentBy !== null ? [[row.id, row.sentBy] as const] : [])),
  );
  return { lines, senders };
}

/** A member's first name, as the chat's "(Team, Amit)" shows them; null for someone no longer a member. */
export function firstNameOf(contacts: readonly MemberContact[], userId: string): string | null {
  const name =
    contacts
      .find((contact) => contact.userId === userId)
      ?.name.trim()
      .split(/\s+/u)[0] ?? "";
  return name === "" ? null : name;
}

/** The team's lines with the first name of the member who wrote each, where identity still knows them. */
export function withTeamNames(
  lines: readonly NaturalChatLine[],
  senders: ReadonlyMap<string, string>,
  contacts: readonly MemberContact[],
): NaturalChatLine[] {
  return lines.map((line) => {
    const userId = senders.get(line.id);
    const name = line.from !== "team" || userId === undefined ? null : firstNameOf(contacts, userId);
    return name === null ? line : { ...line, teamName: name };
  });
}
