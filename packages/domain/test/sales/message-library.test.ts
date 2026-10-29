// The message library for one lead (release 5): the amount is the latest quote's next unpaid instalment, else its
// total; the quote's link is made only when the message is used; a blank with nothing to fill stays.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import { previewMessage, readyMessage } from "../../src/sales/index.js";
import { aLead, aPerson } from "../crm/support/records.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";

const MESSAGE = "Hi {name}, {destination} in {month}. {amount} here: {link} - {agent}";

describe("the message library for a lead", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let sales: MemberAccess;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Message library");
    sales = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  const preview = (leadId: string, text: string, agentName = "") =>
    inOrg((tx) => previewMessage(tx, sales, { leadId, text, agentName }));

  const leadWith = (extra: object = {}) =>
    inOrg(async (tx) => {
      const destination = await tx.destination.create({ data: { name: `Spiti ${randomUUID().slice(0, 6)}` } });
      const person = await aPerson(tx, { name: "Asha Verma" });
      const lead = await aLead(tx, {
        personId: person.id,
        ownerUserId: sales.userId,
        destinationId: destination.id,
        travelKind: "month",
        travelMonth: new Date("2027-05-01T00:00:00Z"),
        ...extra,
      });
      return { lead, destination: destination.name };
    });

  const quoteFor = (leadId: string, status: string, total: number, installments: number[] = [], paid = 0) =>
    inOrg(async (tx) => {
      const quote = await tx.quote.create({
        data: { leadId, title: "Spiti 6 days", status, subtotalPaise: BigInt(total), totalPaise: BigInt(total) },
        select: { id: true },
      });
      for (const [index, amount] of installments.entries()) {
        await tx.quoteInstallment.create({
          data: {
            quoteId: quote.id,
            label: `Part ${String(index + 1)}`,
            amountPaise: BigInt(amount),
            dueOn: new Date(`2027-0${String(index + 1)}-10`),
          },
        });
      }
      if (paid > 0) {
        await tx.quotePayment.create({
          data: { quoteId: quote.id, amountPaise: BigInt(paid), receivedOn: new Date("2027-01-02"), method: "upi" },
        });
      }
      return quote.id;
    });

  it("fills the lead's facts and leaves {amount} and {link} for a lead with no quote", async () => {
    const { lead, destination } = await leadWith();
    const result = await preview(lead.id, MESSAGE, "Meera Rao");
    expect(result.text).toBe(`Hi Asha, ${destination} in May. {amount} here: {link} - Meera`);
    expect(result.open).toEqual(["amount", "link"]);
  });

  it("uses the next unpaid instalment as the amount, else the total", async () => {
    const { lead } = await leadWith();
    await quoteFor(lead.id, "accepted", 5_000_000, [2_000_000, 3_000_000], 2_000_000);
    const next = await preview(lead.id, "{amount}");
    expect(next.text).toBe("₹30,000.00");
    const { lead: plain } = await leadWith();
    await quoteFor(plain.id, "sent", 4_500_000);
    expect((await preview(plain.id, "{amount}")).text).toBe("₹45,000.00");
  });

  it("ignores a draft quote", async () => {
    const { lead } = await leadWith();
    await quoteFor(lead.id, "draft", 1_000_000);
    expect((await preview(lead.id, "{amount}")).open).toEqual(["amount"]);
  });

  it("makes the quote's link only when the message is used, and not for a message without {link}", async () => {
    const { lead } = await leadWith();
    const quoteId = await quoteFor(lead.id, "sent", 4_500_000);
    const links = () => inOrg((tx) => tx.shareLink.count({ where: { recordId: quoteId } }));
    const shown = await preview(lead.id, "See {link}");
    expect(shown).toEqual({ text: "See {link}", open: [] });
    expect(await links()).toBe(0);
    await inOrg((tx) =>
      readyMessage(
        tx,
        sales,
        { leadId: lead.id, text: "No link here", agentName: "", appUrl: "https://app.test" },
        new Date(),
      ),
    );
    expect(await links()).toBe(0);
    const ready = await inOrg((tx) =>
      readyMessage(
        tx,
        sales,
        { leadId: lead.id, text: "See {link}", agentName: "", appUrl: "https://app.test/" },
        new Date(),
      ),
    );
    expect(ready.text).toMatch(/^See https:\/\/app\.test\/p\/\S+$/);
    expect(ready.open).toEqual([]);
    expect(await links()).toBe(1);
  });

  it("refuses a lead the member may not see", async () => {
    const { lead } = await leadWith({ ownerUserId: randomUUID() });
    await expect(preview(lead.id, "{name}")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
