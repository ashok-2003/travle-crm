// What a turn test scripts and reads: a reply's words, the customer's next line, and what the turn sent.
import { testNow } from "../../../inbox/support.js";
import type { liteAgency } from "./lite-agency.js";

export type Agency = Awaited<ReturnType<typeof liteAgency>>;

export const at = (seconds: number) => new Date(testNow.getTime() + seconds * 1000);
export const greeting = "Hi! We run Kedarnath Yatra from Delhi. Which interests you?";

async function newestIn(on: Agency): Promise<string> {
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
