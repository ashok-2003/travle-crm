// A public package page's enquiry (release 7b) against the real database, under row-level security: a page is read only while
// it is published and the agency's pages are on; an enquiry becomes a lead with the page as its source and a first note; one
// submission id is one lead; a fourth enquiry in a day from one person is a quiet duplicate; a blocked number saves nothing;
// joining a departure leaves a task for the lead's owner (the waitlist's wording when it is full); and nobody joins a
// departure the page does not list.
import { randomUUID } from "node:crypto";
import type { PackageEnquiryInput } from "@travel-crm/contracts/package-pages";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addBlockedContact } from "../../src/crm/index.js";
import { findPackageSubmission, recordPackageSpam } from "../../src/crm/index.js";
import {
  publicPageSettingsOf,
  publishedPackage,
  publishedPackages,
  receiveEnquiryOnPackage,
  savePublicPageSettings,
  type PackageEnquiryServices,
} from "../../src/package-pages/index.js";
import { updatePackage, savePackage, setPackagePublished, createQuote } from "../../src/quotes/index.js";
import { aLead, freshPhone } from "../crm/support/records.js";
import { aDeparture } from "../departures/support.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import {
  createSubscribedOrganization,
  createTestPlan,
  createTestSubscriptions,
} from "../subscriptions/test-subscriptions.js";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../../src/identity/index.js";

const now = new Date("2026-11-10T06:00:00Z");
const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

/** An agency on a plan with crm and quotes, paid up, with a salesperson and a manager. */
interface Agency {
  organizationId: string;
  manager: MemberAccess;
  seller: MemberAccess;
  inOrg: <T>(work: (tx: OrgTx) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
}

describe("a public package page and its enquiry", () => {
  let world: Agency;
  let subscriptions: ReturnType<typeof createTestSubscriptions>;
  let services: PackageEnquiryServices;
  let packageId: string;
  let destinationId: string;

  beforeAll(async () => {
    subscriptions = createTestSubscriptions();
    const plan = await createTestPlan(subscriptions, { name: "Pages", modules: ["crm", "quotes"] });
    const organizationId = await createSubscribedOrganization(subscriptions, plan);
    world = {
      organizationId,
      manager: memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() }),
      seller: memberWithStarterRole("sales", { organizationId, userId: randomUUID() }),
      inOrg: (work) => subscriptions.db.forOrg(organizationId, work),
      close: () => subscriptions.close(),
    };
    services = {
      organizationId: world.organizationId,
      ownerUserId: world.manager.userId,
      workers: new Set([world.manager.userId]),
      today: "2026-11-10",
      now,
    };
    destinationId = (
      await world.inOrg((tx) => tx.destination.create({ data: { name: "Kedarnath" }, select: { id: true } }))
    ).id;
    const lead = await world.inOrg((tx) => aLead(tx, { ownerUserId: world.seller.userId, stage: "contacted" }));
    const quote = await world.inOrg((tx) =>
      createQuote(
        tx,
        world.manager,
        {
          leadId: lead.id,
          title: "Kedarnath trip",
          startDate: null,
          adults: 2,
          children: 0,
          days: [],
          items: [],
          inclusions: "",
          exclusions: "",
          notes: "",
          taxRateBasisPoints: 500,
          placeOfSupply: null,
        },
        { supplierStateCode: "27", now },
      ),
    );
    packageId = (
      await world.inOrg((tx) => savePackage(tx, world.manager, { quoteId: quote.id, name: "Kedarnath yatra" }))
    ).id;
    await world.inOrg((tx) =>
      updatePackage(tx, world.manager, {
        packageId,
        name: "Kedarnath yatra",
        title: "Kedarnath yatra",
        days: [],
        inclusions: "",
        exclusions: "",
        notes: "",
        taxRateBasisPoints: 500,
        slug: "kedarnath-yatra",
        destinationId,
        nights: 5,
        summary: "Five days to Kedarnath.",
        highlights: [],
        priceDisplay: "from",
        fromPricePaise: 3_200_000,
        defaultTravellerLevel: null,
        cancellationNotes: "",
        kind: "custom",
        roomTypes: [],
        pricesIncludeGst: true,
        advancePerPersonPaise: null,
        paymentDetails: "",
        pickupPoints: "",
        startCity: "",
        weeklyDays: [],
        departureMonths: [],
        seatsPerDeparture: null,
      }),
    );
    await world.inOrg((tx) => setPackagePublished(tx, world.manager, { packageId, published: true }, 1));
  });
  afterAll(async () => {
    await world.close();
  });

  const open = () => ({ organizationId: world.organizationId, now });
  const pages = (enabled: boolean) =>
    world.inOrg((tx) => savePublicPageSettings(tx, world.manager, { enabled, about: "", instagramUrl: "" }));
  const input = (
    answers: Partial<PackageEnquiryInput["answers"]> = {},
    more: Partial<PackageEnquiryInput> = {},
  ): PackageEnquiryInput => ({
    submissionId: randomUUID(),
    openedToken: "token",
    homepage: "",
    answers: { name: "Meera Pillai", phone: freshPhone(), travellers: 3, ...answers },
    ...more,
  });
  const receive = (enquiry: PackageEnquiryInput) =>
    world.inOrg((tx) => receiveEnquiryOnPackage(tx, services, "kedarnath-yatra", enquiry));
  const leadOf = (phone: string) =>
    world.inOrg((tx) =>
      tx.lead.findFirstOrThrow({
        where: { person: { phoneE164: phone } },
        select: {
          id: true,
          source: true,
          sourceDetail: true,
          destinationId: true,
          ownerUserId: true,
          notes: { select: { body: true } },
        },
      }),
    );

  describe("what a visitor may read", () => {
    it("is nothing while the agency's pages are off, and the published package once they are on", async () => {
      await pages(false);
      expect(await world.inOrg((tx) => publishedPackage(tx, "kedarnath-yatra", open()))).toBeNull();
      expect(await world.inOrg((tx) => publishedPackages(tx, open()))).toEqual([]);
      await pages(true);
      const shown = await world.inOrg((tx) => publishedPackage(tx, "kedarnath-yatra", open()));
      expect(shown).toMatchObject({
        name: "Kedarnath yatra",
        destinationName: "Kedarnath",
        fromPricePaise: 3_200_000,
        nights: 5,
      });
      expect(await world.inOrg((tx) => publishedPackage(tx, "no-such-trip", open()))).toBeNull();
      expect((await world.inOrg((tx) => publishedPackages(tx, open()))).map((one) => one.slug)).toEqual([
        "kedarnath-yatra",
      ]);
      expect(await world.inOrg((tx) => publicPageSettingsOf(tx))).toMatchObject({ enabled: true });
    });

    it("is nothing while the agency is read only or suspended, whatever its pages say", async () => {
      await pages(true);
      const where = { organizationId: world.organizationId };
      for (const status of ["read_only", "suspended"] as const) {
        await subscriptions.platform.subscription.update({ where, data: { status, statusChangedAt: now } });
        expect(await world.inOrg((tx) => publishedPackage(tx, "kedarnath-yatra", open()))).toBeNull();
        expect(await world.inOrg((tx) => publishedPackages(tx, open()))).toEqual([]);
        expect(await reasonOf(receive(input()))).toBe("PAGE_UNAVAILABLE");
      }
      await subscriptions.platform.subscription.update({ where, data: { status: "active", statusChangedAt: now } });
      expect(await world.inOrg((tx) => publishedPackage(tx, "kedarnath-yatra", open()))).not.toBeNull();
    });

    it("shows no price when the agency chose 'on enquiry', and nothing of a package taken down", async () => {
      await world.inOrg((tx) =>
        tx.quoteTemplate.update({ where: { id: packageId }, data: { priceDisplay: "on_enquiry" } }),
      );
      expect((await world.inOrg((tx) => publishedPackage(tx, "kedarnath-yatra", open())))?.fromPricePaise).toBeNull();
      await world.inOrg((tx) => tx.quoteTemplate.update({ where: { id: packageId }, data: { priceDisplay: "from" } }));
      await world.inOrg((tx) => setPackagePublished(tx, world.manager, { packageId, published: false }, 1));
      expect(await world.inOrg((tx) => publishedPackage(tx, "kedarnath-yatra", open()))).toBeNull();
      expect(await reasonOf(receive(input()))).toBe("PAGE_UNAVAILABLE");
      await world.inOrg((tx) => setPackagePublished(tx, world.manager, { packageId, published: true }, 1));
    });
  });

  describe("an enquiry", () => {
    it("becomes a lead from the page, for the package's destination, with a first note", async () => {
      const enquiry = input({ message: "A vegetarian cook, please." });
      expect(await receive(enquiry)).toBe("new_lead");
      const lead = await leadOf(enquiry.answers.phone);
      expect(lead).toMatchObject({ source: "package_page", sourceDetail: "Kedarnath yatra", destinationId });
      expect(lead.notes.map((note) => note.body).join("\n")).toContain("Enquired about Kedarnath yatra");
      expect(lead.notes.map((note) => note.body).join("\n")).toContain("A vegetarian cook, please.");
    });

    it("is one lead for one submission id, however often it is sent", async () => {
      const enquiry = input();
      expect(await receive(enquiry)).toBe("new_lead");
      expect(await receive(enquiry)).toBe("new_lead");
      const phone = enquiry.answers.phone;
      expect(await world.inOrg((tx) => tx.lead.count({ where: { person: { phoneE164: phone } } }))).toBe(1);
    });

    it("adds to the open lead of someone who asks again", async () => {
      const first = input();
      await receive(first);
      expect(await receive(input({ phone: first.answers.phone, name: "Meera P" }))).toBe("repeat_enquiry");
      expect(await world.inOrg((tx) => tx.lead.count({ where: { person: { phoneE164: first.answers.phone } } }))).toBe(
        1,
      );
    });

    it("keeps one person to three enquiries in a day: the fourth saves nothing and is thanked alike", async () => {
      const phone = freshPhone();
      for (let turn = 0; turn < 3; turn += 1)
        expect(["new_lead", "repeat_enquiry"]).toContain(await receive(input({ phone })));
      expect(await receive(input({ phone }))).toBe("duplicate");
    });

    it("saves nothing for a blocked number", async () => {
      const phone = freshPhone();
      await world.inOrg((tx) => addBlockedContact(tx, world.manager, { kind: "phone", value: phone }));
      expect(await receive(input({ phone }))).toBe("blocked");
      expect(await world.inOrg((tx) => tx.lead.count({ where: { person: { phoneE164: phone } } }))).toBe(0);
    });

    it("records a honeypot's catch in the ledger without a lead", async () => {
      const submissionId = randomUUID();
      await world.inOrg((tx) => recordPackageSpam(tx, { submissionId, packageId, now }));
      expect(await world.inOrg((tx) => findPackageSubmission(tx, submissionId))).toEqual({ outcome: "spam" });
    });

    it("refuses links in the message", async () => {
      expect(
        await reasonOf(receive(input({ message: "see http://a.example http://b.example http://c.example" }))),
      ).toBe("FORM_LINKS_NOT_ALLOWED");
    });
  });

  describe("joining a departure", () => {
    const aListedDeparture = (seats: number, title: string) =>
      world.inOrg(async (tx) => {
        const made = await aDeparture(tx, { title, startDate: "2026-12-03", endDate: "2026-12-08", seatsTotal: seats });
        await tx.departure.update({ where: { id: made.id }, data: { destinationId } });
        return made.id;
      });

    it("leaves a task for the lead's owner to hold seats or make a quote", async () => {
      const departureId = await aListedDeparture(20, "Kedarnath yatra, 3 Dec");
      const enquiry = input({ name: "Dev Malhotra", travellers: 2 }, { departureId });
      expect(await receive(enquiry)).toBe("new_lead");
      const lead = await leadOf(enquiry.answers.phone);
      expect(lead.notes.map((note) => note.body).join("\n")).toContain(
        "Wants to join the departure: Kedarnath yatra, 3 Dec",
      );
      const tasks = await world.inOrg((tx) => tx.task.findMany({ where: { recordType: "lead", recordId: lead.id } }));
      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.title).toBe("Hold seats or make a quote: Dev Malhotra, 2 seats on Kedarnath yatra, 3 Dec");
      expect(tasks[0]?.assigneeUserId).toBe(lead.ownerUserId);
    });

    it("says waitlist when the departure is full", async () => {
      const departureId = await aListedDeparture(1, "Kedarnath yatra, full");
      const lead = await world.inOrg((tx) => aLead(tx, { ownerUserId: world.seller.userId, stage: "contacted" }));
      await world.inOrg((tx) =>
        tx.departureHold.create({
          data: {
            departureId,
            leadId: lead.id,
            seats: 1,
            expiresAt: new Date("2026-11-11T06:00:00Z"),
            status: "active",
          },
        }),
      );
      const enquiry = input({ name: "Asha Rao", travellers: 1 }, { departureId });
      await receive(enquiry);
      const joined = await leadOf(enquiry.answers.phone);
      const tasks = await world.inOrg((tx) => tx.task.findMany({ where: { recordType: "lead", recordId: joined.id } }));
      expect(tasks[0]?.title).toBe("Add to the waitlist: Asha Rao, 1 seat on Kedarnath yatra, full");
    });

    it("refuses a departure the page does not list", async () => {
      const elsewhere = await world.inOrg(
        async (tx) =>
          (await aDeparture(tx, { title: "Spiti batch", startDate: "2026-12-03", endDate: "2026-12-08" })).id,
      );
      expect(await reasonOf(receive(input({}, { departureId: elsewhere })))).toBe("DEPARTURE_UNAVAILABLE");
      const closed = await world.inOrg(async (tx) => {
        const made = await aDeparture(tx, {
          title: "Closed batch",
          status: "closed",
          startDate: "2026-12-03",
          endDate: "2026-12-08",
        });
        await tx.departure.update({ where: { id: made.id }, data: { destinationId } });
        return made.id;
      });
      expect(await reasonOf(receive(input({}, { departureId: closed })))).toBe("DEPARTURE_UNAVAILABLE");
      const past = await world.inOrg(async (tx) => {
        const made = await aDeparture(tx, { title: "Past batch", startDate: "2026-11-01", endDate: "2026-11-05" });
        await tx.departure.update({ where: { id: made.id }, data: { destinationId } });
        return made.id;
      });
      expect(await reasonOf(receive(input({}, { departureId: past })))).toBe("DEPARTURE_UNAVAILABLE");
    });
  });
});
