// What the AI agent is given for one chat (the AI sales agent, ADR 0029's layered pack): the agency's knowledge (its own
// pieces, its trips' details, its quote packages) narrowed to what the conversation is about, the lead's facts, what the
// agent remembers of the chat, and its last messages. Inside forOrg, so no other agency's data can reach the prompt.
import type { AiMessage } from "@travel-crm/integrations/ai";
import type { OrgTx } from "@travel-crm/db";

/** Characters of knowledge one prompt carries at most: enough for a price list, small enough for a free model. */
const KNOWLEDGE_BUDGET = 12_000;
const HISTORY = 30;

const wordsOf = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 2),
  );

/** The agency's knowledge, the pieces sharing most words with the conversation first, within the budget. */
export async function knowledgePack(tx: OrgTx, about: string): Promise<string> {
  const own = await tx.aiKnowledge.findMany({
    where: { enabled: true, status: "ready" },
    select: { title: true, body: true },
  });
  const trips = await tx.tripKit.findMany({ select: { name: true, message: true, keywords: true } });
  const packages = await tx.quoteTemplate.findMany({
    select: { name: true, title: true, items: true, inclusions: true },
  });
  const pieces = [
    ...own.map((piece) => ({ title: piece.title, body: piece.body })),
    ...trips.map((trip) => ({
      title: `Trip: ${trip.name}`,
      body: `${trip.message}\nKeywords: ${trip.keywords.join(", ")}`,
    })),
    ...packages.map((one) => ({
      title: `Package: ${one.name}`,
      body: `${one.title}\n${JSON.stringify(one.items)}\nIncludes: ${one.inclusions}`,
    })),
  ].filter((piece) => piece.body.trim() !== "");
  const wanted = wordsOf(about);
  const ranked = pieces
    .map((piece) => {
      const words = wordsOf(`${piece.title} ${piece.body}`);
      let overlap = 0;
      for (const word of wanted) if (words.has(word)) overlap += 1;
      return { piece, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap);
  let left = KNOWLEDGE_BUDGET;
  const chosen: string[] = [];
  for (const { piece } of ranked) {
    const block = `## ${piece.title}\n${piece.body.trim()}`;
    if (block.length > left) {
      if (chosen.length === 0) chosen.push(block.slice(0, left));
      break;
    }
    chosen.push(block);
    left -= block.length;
  }
  return chosen.length === 0 ? "(The agency has given no packages or prices yet.)" : chosen.join("\n\n");
}

/** The chat's last messages as the conversation the model continues: the customer as user, the agency as assistant. */
export async function chatHistory(
  tx: OrgTx,
  conversationId: string,
): Promise<{ messages: AiMessage[]; lastCustomerText: string }> {
  const rows = await tx.whatsappMessage.findMany({
    where: { conversationId, kind: { not: "reaction" } },
    orderBy: { occurredAt: "desc" },
    take: HISTORY,
    select: { direction: true, kind: true, body: true, caption: true, fileName: true },
  });
  const said = (row: (typeof rows)[number]) => {
    const words = row.body ?? row.caption ?? "";
    if (row.kind === "text" || row.kind === "template") return words;
    return `[${row.kind}${row.fileName === null ? "" : `: ${row.fileName}`}]${words === "" ? "" : ` ${words}`}`;
  };
  const messages: AiMessage[] = [];
  for (const row of [...rows].reverse()) {
    const content = said(row).trim();
    if (content === "") continue;
    const role = row.direction === "in" ? "user" : "assistant";
    const last = messages.at(-1);
    // Consecutive messages from one side read as one turn.
    if (last?.role === role) last.content = `${last.content}\n${content}`;
    else messages.push({ role, content });
  }
  // The model continues after the customer: a conversation that ends with the agency gets a marker turn.
  if (messages[0]?.role === "assistant")
    messages.unshift({ role: "user", content: "(The chat began with our message.)" });
  const lastCustomer = [...rows].find((row) => row.direction === "in");
  return { messages, lastCustomerText: lastCustomer === undefined ? "" : said(lastCustomer) };
}

/** The lead's facts the agent may use: what we already know, so it never asks twice. */
export async function leadFactsFor(tx: OrgTx, personId: string | null) {
  if (personId === null) return { leadId: null, words: "Nothing is known about this customer yet." };
  const lead = await tx.lead.findFirst({
    where: { personId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      stage: true,
      travelKind: true,
      travelStart: true,
      travelMonth: true,
      adults: true,
      childrenAges: true,
      budgetPaise: true,
      budgetBasis: true,
      departureCity: true,
      destinationId: true,
      person: { select: { name: true } },
    },
  });
  if (lead === null) return { leadId: null, words: "Nothing is known about this customer yet." };
  const destination =
    lead.destinationId === null
      ? null
      : (await tx.destination.findUnique({ where: { id: lead.destinationId }, select: { name: true } }))?.name;
  const known = [
    `Name: ${lead.person.name}`,
    `Stage: ${lead.stage}`,
    destination === null || destination === undefined ? null : `Destination: ${destination}`,
    lead.travelKind === "dates" && lead.travelStart !== null
      ? `Travel from: ${lead.travelStart.toISOString().slice(0, 10)}`
      : null,
    lead.travelKind === "month" && lead.travelMonth !== null
      ? `Travel month: ${lead.travelMonth.toISOString().slice(0, 7)}`
      : null,
    lead.adults === null ? null : `Adults: ${String(lead.adults)}`,
    lead.childrenAges.length === 0 ? null : `Children ages: ${lead.childrenAges.join(", ")}`,
    lead.budgetPaise === null
      ? null
      : `Budget: Rs ${String(Number(lead.budgetPaise) / 100)} ${lead.budgetBasis === "per_person" ? "per person" : "for everyone"}`,
    lead.departureCity === null ? null : `Leaving from: ${lead.departureCity}`,
  ].filter((line): line is string => line !== null);
  return { leadId: lead.id, words: known.join("\n") };
}
