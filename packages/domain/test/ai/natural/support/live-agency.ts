// The agency the agent's live tests start from (plan 2: its reads, its act and its turn): Plan 1's natural agency, its
// number connected, the AI on, a customer who has written, the lead their message opened, owned by the Owner, the
// brochure's and the QR's bytes in storage, the trip sheets the turn reads, and a quote as the loop's `quote` tool
// makes one. The clock is past the earlier agents' last line (ruling
// 2), so the AI lines a test writes are this agent's. Invented data.
import { randomUUID } from "node:crypto";
import type { BookingTerms } from "@travel-crm/contracts/ai";
import type { LiteDependencies, LiteTurnInput } from "../../../../src/ai/lite/types.js";
import { prepareNaturalTurn } from "../../../../src/ai/natural/prepare.js";
import { quoteFor } from "../../../../src/ai/natural/tools/read-tools.js";
import { tripSheetsOf } from "../../../../src/ai/natural/trips/trip-sheets.js";
import type { QuoteFigures } from "../../../../src/ai/natural/types.js";
import type { MemberContact } from "../../../../src/identity/index.js";
import { parseCalendarDate } from "../../../../src/kernel/index.js";
import { memberOf } from "../../../imports/support/test-imports.js";
import { deliver, freshPhone, fromCustomer, type TestInbox } from "../../../inbox/support.js";
import { liteEntitlements } from "../../lite/support/lite-agency.js";
import { naturalAgency } from "./natural-agency.js";

/** The turn's clock: Friday 20 November 2026, 3:30 pm in Kolkata, a week after the move to one agent. */
export const liveNow = new Date("2026-11-20T10:00:00Z");
export const liveToday = parseCalendarDate("2026-11-20");
/** `seconds` from the turn's clock (negative: before it). */
export const liveAt = (seconds: number) => new Date(liveNow.getTime() + seconds * 1000);

export const CUSTOMER_NAME = "Rahul";
/** The customer's first line, two minutes before the turn's clock. */
export const FIRST_LINE = "Hi, Kedarkantha in December?";
export const FIRST_AT = liveAt(-120);

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
  /** The reply button or list row the customer tapped. */
  buttonReplyId?: string;
}

/**
 * `trips` and `paymentDetails` as Plan 1's agency takes them; `adults` a person typed on the lead; `customerName` the
 * customer's WhatsApp profile name (Rahul unless told).
 */
export async function liveAgency(
  test: TestInbox,
  options: { trips?: number; paymentDetails?: boolean; adults?: number; customerName?: string } = {},
) {
  const { customerName = CUSTOMER_NAME } = options;
  const { organizationId, packageIds, model } = await naturalAgency(test, options);
  const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
  const owner = memberOf(organizationId, "org-owner");
  /** Someone on the team besides the Owner. */
  const amit = { userId: randomUUID(), name: "Amit Kumar", email: null };
  const team: MemberContact[] = [{ userId: owner.userId, name: "Asha Rao", email: "asha@example.com" }, amit];
  const connection = await inOrg(async (tx) => {
    const row = await tx.whatsappConnection.findFirstOrThrow({ select: { id: true, integratedNumber: true } });
    return { organizationId, connectionId: row.id, integratedNumber: row.integratedNumber };
  });
  const customerNumber = freshPhone().replace("+", "");
  /** The customer writes `text` at `at`, through the inbox as the webhook does; returns the line. */
  const say = async (text: string, at: Date) => {
    await deliver(test, fromCustomer(connection, { customerNumber, customerName, text }), at);
    return inOrg((tx) =>
      tx.whatsappMessage.findFirstOrThrow({ where: { direction: "in" }, orderBy: { occurredAt: "desc" } }),
    );
  };
  const message = await say(FIRST_LINE, FIRST_AT);
  const { chat, leadId } = await inOrg(async (tx) => {
    const found = await tx.whatsappConversation.findFirstOrThrow();
    // The inbox opened a lead for the new customer, with their first words as its note.
    const opened = await tx.lead.findFirstOrThrow({ where: { personId: found.personId ?? "" }, select: { id: true } });
    await tx.lead.update({
      where: { id: opened.id },
      data: { ownerUserId: owner.userId, ...(options.adults === undefined ? {} : { adults: options.adults }) },
    });
    return { chat: found, leadId: opened.id };
  });
  // The files' bytes, so a turn that sends one can copy it onto its message inside storage.
  const files = await inOrg((tx) =>
    tx.attachment.findMany({ select: { id: true, contentType: true, recordId: true } }),
  );
  for (const file of files) {
    await test.storage.put({
      key: `organizations/${organizationId}/attachments/${file.id}`,
      contentType: file.contentType,
      body: new Uint8Array([1, 2, 3]),
    });
  }
  const [kedarkantha = "", brahmatal = ""] = packageIds;
  const brochureId = files.find((file) => file.recordId === kedarkantha)?.id ?? "";
  const sheets = await inOrg((tx) =>
    tripSheetsOf(
      tx,
      packageIds.map((id) => ({ id, kind: "group" })),
      liveToday,
      liveNow,
    ),
  );
  const labels = new Map(sheets.map((sheet) => [sheet.label, sheet.packageId]));
  /** The loop's quote for these terms, as `offer_booking` and `book` stage it. */
  const quote = async (terms: BookingTerms): Promise<QuoteFigures> => {
    const figures = await inOrg((tx) => quoteFor({ tx, sheets, labels, today: liveToday, now: liveNow }, terms));
    if ("refused" in figures) throw new Error(figures.refused);
    return figures;
  };
  /** A line straight into the chat, past the inbox; returns its id. */
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
          buttonReplyId: line.buttonReplyId ?? null,
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
  /** The worker's dependencies, as the agent's turn takes them. */
  const dependencies = () =>
    ({
      db: test.db,
      ai: model,
      agencyName: () => Promise.resolve("Case Trips"),
      files: test.files,
      managers: () => Promise.resolve([owner.userId]),
      subscriptions: { entitlementsOf: () => Promise.resolve(liteEntitlements) },
      identity,
    }) satisfies LiteDependencies;
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
    kedarkantha,
    brahmatal,
    brochureId,
    sheets,
    model,
    inOrg,
    owner,
    amit,
    chat,
    message,
    leadId,
    say,
    quote,
    write,
    identity,
    dependencies,
    turnInput,
    prepare,
  };
}

export type LiveAgency = Awaited<ReturnType<typeof liveAgency>>;
