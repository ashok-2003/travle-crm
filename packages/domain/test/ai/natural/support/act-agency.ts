// The agency the natural agent's live act is tested on: Plan 1's agency T with the natural agent chosen, a customer who
// wrote on the connected number, their open lead owned by the Owner, the brochure's and the QR's bytes in storage, the
// trip sheets the turn read, and a quote as the loop's `quote` tool makes one.
import type { BookingTerms } from "@travel-crm/contracts/ai";
import { setAgent } from "../../../../src/ai/agent-choice.js";
import { quoteFor } from "../../../../src/ai/natural/tools/read-tools.js";
import { tripSheetsOf } from "../../../../src/ai/natural/trips/trip-sheets.js";
import type { QuoteFigures } from "../../../../src/ai/natural/types.js";
import { parseCalendarDate, systemActor } from "../../../../src/kernel/index.js";
import { aLead } from "../../../crm/support/records.js";
import { memberOf } from "../../../imports/support/test-imports.js";
import { deliver, freshPhone, fromCustomer, testNow, type TestInbox } from "../../../inbox/support.js";
import { naturalAgency } from "./natural-agency.js";

/** The act runs a minute after the customer wrote: 15:31 in India on Friday 23 Oct. */
export const actNow = new Date(testNow.getTime() + 60_000);
export const actToday = parseCalendarDate("2026-10-23");

/** `adults` a person typed on the lead; `customerName` the customer's WhatsApp profile name (Rahul unless told). */
export async function actAgency(test: TestInbox, options: { adults?: number; customerName?: string } = {}) {
  const { customerName = "Rahul" } = options;
  const { organizationId, packageIds } = await naturalAgency(test);
  const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
  const owner = memberOf(organizationId, "org-owner");
  const { id: connectionId, integratedNumber } = await inOrg((tx) =>
    tx.whatsappConnection.findFirstOrThrow({ select: { id: true, integratedNumber: true } }),
  );
  const customerNumber = freshPhone().replace("+", "");
  /** The customer writes `text` at `at`; returns the line, which a turn answering it takes as its token. */
  const say = async (text: string, at = testNow) => {
    const connection = { organizationId, connectionId, integratedNumber };
    await deliver(test, fromCustomer(connection, { customerNumber, customerName, text }), at);
    return inOrg((tx) =>
      tx.whatsappMessage.findFirstOrThrow({ where: { direction: "in" }, orderBy: { occurredAt: "desc" } }),
    );
  };
  const message = await say("Hi, is the Kedarkantha trek on in December?");
  const chat = await inOrg((tx) => tx.whatsappConversation.findFirstOrThrow());
  const leadId = await inOrg(async (tx) => {
    await setAgent(tx, systemActor(organizationId), "natural");
    const lead = await aLead(tx, {
      ...(chat.personId === null ? {} : { personId: chat.personId }),
      stage: "new",
      ownerUserId: owner.userId,
      ...(options.adults === undefined ? {} : { adults: options.adults }),
    });
    return lead.id;
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
      actToday,
      actNow,
    ),
  );
  const labels = new Map(sheets.map((sheet) => [sheet.label, sheet.packageId]));
  /** The loop's quote for these terms, as `offer_booking` and `book` stage it. */
  const quote = async (terms: BookingTerms): Promise<QuoteFigures> => {
    const figures = await inOrg((tx) => quoteFor({ tx, sheets, labels, today: actToday, now: actNow }, terms));
    if ("refused" in figures) throw new Error(figures.refused);
    return figures;
  };
  return {
    organizationId,
    inOrg,
    owner,
    chat,
    message,
    leadId,
    kedarkantha,
    brahmatal,
    brochureId,
    sheets,
    quote,
    say,
  };
}

export type ActAgency = Awaited<ReturnType<typeof actAgency>>;
