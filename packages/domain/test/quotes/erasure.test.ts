// Erasing a customer empties what the quotes and the hot-lead signals keep about them: the name typed to accept, the
// notes on their quotes, a payment's reference, their signals. The amounts stay, and another customer's are untouched.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { aLead, aPerson } from "../crm/support/records.js";
import { systemActor } from "../../src/kernel/index.js";
import { eraseCustomerParts } from "../../src/platform/erase-customer.js";
import { acceptQuoteFromLink, createQuote, recordPayment, setQuoteStatus } from "../../src/quotes/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";

const now = new Date("2026-11-10T06:00:00Z");

describe("erasing a customer who has quotes", () => {
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
  let organizationId: string;
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Quote erasure");
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  /** A customer with a lead, an accepted and paid quote that names them, and a hot-lead signal. */
  async function aCustomer(name: string) {
    const owner = memberWithStarterRole("org-owner", { organizationId, userId: randomUUID() });
    return inOrg(async (tx) => {
      const person = await aPerson(tx, { name });
      const lead = await aLead(tx, { personId: person.id, ownerUserId: owner.userId, stage: "contacted" });
      const quote = await createQuote(
        tx,
        owner,
        {
          leadId: lead.id,
          title: "Goa",
          startDate: null,
          adults: 2,
          children: 0,
          days: [],
          items: [{ description: "Package", detail: "", quantity: 1, unitPricePaise: 1_000_000 }],
          inclusions: "",
          exclusions: "",
          notes: `Call ${name}'s mother Sunita on 98xxxxxx`,
          taxRateBasisPoints: 0,
          placeOfSupply: null,
        },
        { supplierStateCode: "27", now },
      );
      await setQuoteStatus(tx, owner, { quoteId: quote.id, status: "sent" }, now);
      await acceptQuoteFromLink(tx, { organizationId, quoteId: quote.id, name }, now);
      await recordPayment(
        tx,
        owner,
        {
          quoteId: quote.id,
          amountPaise: 400_000,
          receivedOn: "2026-11-10",
          method: "upi",
          reference: `From ${name}`,
          requestId: randomUUID(),
        },
        now,
      );
      await tx.leadSignal.create({ data: { leadId: lead.id, kind: "quote_opened", sourceKey: randomUUID(), at: now } });
      return { personId: person.id, leadId: lead.id, quoteId: quote.id };
    });
  }

  it("empties their quotes' names, notes and payment references and their signals, and no one else's", async () => {
    const erased = await aCustomer("Neha Joshi");
    const kept = await aCustomer("Arjun Rao");
    await platformDb.transaction((tx) =>
      eraseCustomerParts(tx, systemActor(organizationId), { organizationId, personId: erased.personId }, now),
    );
    const state = (customer: { leadId: string; quoteId: string }) =>
      inOrg(async (tx) => ({
        quote: await tx.quote.findUniqueOrThrow({
          where: { id: customer.quoteId },
          select: { acceptedName: true, notes: true, totalPaise: true },
        }),
        references: (await tx.quotePayment.findMany({ where: { quoteId: customer.quoteId } })).map(
          (row) => row.reference,
        ),
        signals: await tx.leadSignal.count({ where: { leadId: customer.leadId } }),
      }));
    expect(await state(erased)).toEqual({
      quote: { acceptedName: null, notes: "", totalPaise: 1_000_000n },
      references: [""],
      signals: 0,
    });
    expect(await state(kept)).toMatchObject({
      quote: { acceptedName: "Arjun Rao" },
      references: ["From Arjun Rao"],
      signals: 1,
    });
  });
});
