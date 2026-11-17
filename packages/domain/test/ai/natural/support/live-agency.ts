// The agency the natural agent's live tests start from (plan 2): Plan 1's natural agency, its number connected, the AI on
// and agent = 'natural', a customer who has written, and the lead their message opened, owned by the Owner. The clock is
// past the earlier agents' last line (ruling 2), so the AI lines a test writes are this agent's. Invented data.
import { randomUUID } from "node:crypto";
import type { MemberContact } from "../../../../src/identity/index.js";
import type { LiteDependencies, LiteTurnInput } from "../../../../src/ai/lite/types.js";
import { prepareNaturalTurn } from "../../../../src/ai/natural/prepare.js";
import { memberOf } from "../../../imports/support/test-imports.js";
import { deliver, freshPhone, fromCustomer, type TestInbox } from "../../../inbox/support.js";
import { naturalAgency } from "./natural-agency.js";

/** The turn's clock: Friday 20 November 2026, 3:30 pm in Kolkata, a week after the move to one agent. */
export const liveNow = new Date("2026-11-20T10:00:00Z");
/** `seconds` from the turn's clock (negative: before it). */
export const liveAt = (seconds: number) => new Date(liveNow.getTime() + seconds * 1000);

export const CUSTOMER_NAME = "Rahul";

/** A message straight into the chat: a customer's moves the chat's last inbound time on, as the webhook would. */
export interface WrittenLine {
  direction: "in" | "out";
  at: Date;
  kind?: string;
  body?: string;
  caption?: string;
  fileName?: string;
  /** Unset: the customer's for a line in, the automation's for a line out. */
  origin?: string;
  clientToken?: string;
  sentBy?: string;
  /** Unset: received for a line in, sent for a line out. */
  status?: string;
}

/** `trips` and `paymentDetails` as Plan 1's agency takes them. */
export async function liveAgency(test: TestInbox, options: { trips?: number; paymentDetails?: boolean } = {}) {
  const { organizationId, packageIds, model } = await naturalAgency(test, options);
  const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
  const owner = memberOf(organizationId, "org-owner");
  /** Someone on the team besides the Owner. */
  const amit = { userId: randomUUID(), name: "Amit Kumar", email: null };
  const team: MemberContact[] = [{ userId: owner.userId, name: "Asha Rao", email: "asha@example.com" }, amit];
  const connection = await inOrg(async (tx) => {
    await tx.aiAutopilot.update({ where: { organizationId }, data: { agent: "natural" } });
    const row = await tx.whatsappConnection.findFirstOrThrow({ select: { id: true, integratedNumber: true } });
    return { organizationId, connectionId: row.id, integratedNumber: row.integratedNumber };
  });
  const customerNumber = freshPhone().replace("+", "");
  await deliver(
    test,
    fromCustomer(connection, { customerNumber, customerName: CUSTOMER_NAME, text: "Hi, Kedarkantha in December?" }),
    liveAt(-120),
  );
  const { chat, message, leadId } = await inOrg(async (tx) => {
    const found = await tx.whatsappConversation.findFirstOrThrow();
    const first = await tx.whatsappMessage.findFirstOrThrow({ where: { direction: "in" } });
    // The inbox opened a lead for the new customer, with their first words as its note.
    const opened = await tx.lead.findFirstOrThrow({ where: { personId: found.personId ?? "" }, select: { id: true } });
    await tx.lead.update({ where: { id: opened.id }, data: { ownerUserId: owner.userId } });
    return { chat: found, message: first, leadId: opened.id };
  });
  const write = (line: WrittenLine) =>
    inOrg(async (tx) => {
      const incoming = line.direction === "in";
      const row = await tx.whatsappMessage.create({
        data: {
          conversationId: chat.id,
          direction: line.direction,
          origin: line.origin ?? (incoming ? "customer" : "automation"),
          kind: line.kind ?? "text",
          body: line.body ?? null,
          caption: line.caption ?? null,
          fileName: line.fileName ?? null,
          clientToken: line.clientToken ?? null,
          sentBy: line.sentBy ?? null,
          wamid: incoming ? `wamid.${randomUUID()}` : null,
          status: line.status ?? (incoming ? "received" : "sent"),
          occurredAt: line.at,
        },
        select: { id: true },
      });
      if (incoming) {
        await tx.whatsappConversation.updateMany({
          where: { id: chat.id, lastInboundAt: { lt: line.at } },
          data: { lastInboundAt: line.at },
        });
      }
      return row.id;
    });
  /** Identity as the worker's: the team above; anyone else is no longer a member. */
  const identity: NonNullable<LiteDependencies["identity"]> = {
    firstOwner: () => Promise.resolve(owner.userId),
    leadWorkers: () => Promise.resolve([{ userId: owner.userId, name: "Asha Rao" }]),
    organizationProfile: () => Promise.resolve(null),
    memberContacts: (_organizationId, userIds) => Promise.resolve(team.filter((one) => userIds.includes(one.userId))),
    membersHolding: () => Promise.resolve([owner.userId]),
  };
  const dependencies = (): LiteDependencies => ({
    db: test.db,
    ai: model,
    agencyName: () => Promise.resolve("Case Trips"),
    files: test.files,
    managers: () => Promise.resolve([owner.userId]),
    identity,
  });
  /** A reply turn for the customer's first message, or for `token` (a later message's id). */
  const turnInput = (token = message.id): LiteTurnInput => ({
    organizationId,
    conversationId: chat.id,
    kind: "reply",
    token,
  });
  const prepare = (at = liveNow, token?: string) => prepareNaturalTurn(dependencies(), turnInput(token), at);
  return {
    organizationId,
    packageIds,
    model,
    inOrg,
    owner,
    amit,
    chat,
    message,
    leadId,
    write,
    dependencies,
    turnInput,
    prepare,
  };
}

export type LiveAgency = Awaited<ReturnType<typeof liveAgency>>;
