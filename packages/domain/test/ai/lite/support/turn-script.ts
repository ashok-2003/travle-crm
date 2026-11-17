// What a lite turn test scripts and reads: the model's Understand and Write answers, the customer's next line, and what
// the turn sent and spent.
import { liteFacts, type LiteFacts, type LiteIntent, type UnderstandForm } from "@travel-crm/contracts/ai";
import { saveLiteFacts } from "../../../../src/ai/lite/merge.js";
import { testNow } from "../../../inbox/support.js";
import type { liteAgency } from "./lite-agency.js";

export type Agency = Awaited<ReturnType<typeof liteAgency>>;

const noDetails: UnderstandForm["details"] = {
  package: null,
  place: null,
  date: null,
  adults: null,
  children: null,
  name: null,
  pickup_city: null,
  room: null,
  pay_in_full: null,
};

/** The Understand model's answer: the intents with their proof, and any details. */
export const understood = (
  intents: [LiteIntent, string][],
  changes: {
    details?: Partial<UnderstandForm["details"]>;
    language?: UnderstandForm["language"];
    summary?: string;
    chance?: number;
  } = {},
): string =>
  JSON.stringify({
    intents: intents.map(([name, proof]) => ({ name, proof })),
    details: { ...noDetails, ...changes.details },
    open_to_other_trips: "unknown",
    lookups: [],
    language: changes.language ?? "english",
    summary: changes.summary ?? "Asked about Kedarnath.",
    score: {
      chance: changes.chance ?? 55,
      label: "warm",
      reasons: ["Asked about a trip"],
      looks_fake: false,
      fake_why: "",
      standing: "Looking at Kedarnath",
      next_step: "Share the dates",
    },
  });

/** The Write model's answer. */
export const written = (text: string) => JSON.stringify({ text, cannot_answer: false });
export const at = (seconds: number) => new Date(testNow.getTime() + seconds * 1000);
export const greeting = "Hi! We run [package 1] from [from 1]. Which interests you?";

export async function newestIn(on: Agency): Promise<string> {
  const row = await on.inOrg((tx) =>
    tx.whatsappMessage.findFirstOrThrow({ where: { direction: "in" }, orderBy: { occurredAt: "desc" } }),
  );
  return row.id;
}

/** The customer's new line, and its id: the token of the turn that answers it. */
export async function says(on: Agency, text: string, seconds: number): Promise<string> {
  await on.say(text, "text", at(seconds));
  return newestIn(on);
}

export const outbound = (on: Agency) =>
  on.inOrg((tx) => tx.whatsappMessage.findMany({ where: { direction: "out" }, orderBy: { occurredAt: "asc" } }));
export const calls = async (on: Agency) => (await on.inOrg((tx) => tx.aiUsage.findFirst()))?.calls ?? 0;
export const withFacts = (on: Agency, facts: Partial<LiteFacts>) =>
  on.inOrg((tx) => saveLiteFacts(tx, on.chat.id, liteFacts.parse({ agent: "lite", ...facts })));
