// The agency every lite test starts from: a connected number, a customer who has written, a ready setup (a Kedarnath group
// package with two departures, payment details, answers, name and tone), and the autopilot on.
import {
  AGENCY_PAYMENT_QR_RECORD_TYPE,
  PACKAGE_BROCHURE_RECORD_TYPE,
  PACKAGE_PHOTO_RECORD_TYPE,
} from "@travel-crm/contracts/files";
import type { RoomType } from "@travel-crm/contracts/quotes";
import type { Database } from "@travel-crm/db";
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import {
  runAgentTurn,
  runAiNudges,
  saveAgencyAnswers,
  saveAgentBasics,
  saveAiSettings,
} from "../../../../src/ai/index.js";
import type { TraceSink } from "../../../../src/ai/lite/types.js";
import { parseCalendarDate } from "../../../../src/kernel/index.js";
import type { Entitlements } from "../../../../src/subscriptions/index.js";
import { aLead } from "../../../crm/support/records.js";
import { memberOf } from "../../../imports/support/test-imports.js";
import { storeAutopilot } from "../../support/store-autopilot.js";
import {
  aConnectedAgency,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestInbox,
} from "../../../inbox/support.js";

export const liteEntitlements: Entitlements = {
  status: "active",
  access: "full",
  planName: "Test",
  modules: new Set(["crm", "inbox", "ai"]),
  limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1e9 },
  trialEndsOn: null,
  paidThrough: null,
  nextChangeOn: null,
};
const day = (text: string) => new Date(`${text}T00:00:00Z`);
const readyFile = (recordType: string, recordId: string, fileName: string, contentType: string) => ({
  recordType,
  recordId,
  fileName,
  contentType,
  sizeBytes: 3,
  status: "ready",
  confirmedAt: new Date(),
});

export const liteToday = parseCalendarDate("2026-11-10");
export const liteTurnAt = new Date(testNow.getTime() + 60_000);

/** `roomTypes` are the package's (double, triple and a child bed unless told). */
export async function liteAgency(test: TestInbox, options: { ready?: boolean; roomTypes?: RoomType[] } = {}) {
  const { ready = true, roomTypes = ["double", "triple", "child_bed"] } = options;
  const connection = await aConnectedAgency(test);
  const { organizationId } = connection;
  const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
  const owner = memberOf(organizationId, "org-owner");
  const customerNumber = freshPhone().replace("+", "");
  const say = (text: string, kind = "text", at = testNow) =>
    deliver(test, fromCustomer(connection, { customerNumber, customerName: "Rahul", text, contentType: kind }), at);
  await say("Hi, is the Kedarnath yatra running?");
  const chat = await inOrg((tx) => tx.whatsappConversation.findFirstOrThrow());
  const message = await inOrg((tx) => tx.whatsappMessage.findFirstOrThrow({ where: { direction: "in" } }));
  const ids = await inOrg(async (tx) => {
    const lead = await aLead(tx, {
      ...(chat.personId === null ? {} : { personId: chat.personId }),
      stage: "new",
      ownerUserId: owner.userId,
    });
    await saveAiSettings(
      tx,
      owner,
      { enabled: true, scoring: true, instructions: "" },
      { providerReady: true, now: testNow },
    );
    await storeAutopilot(tx, organizationId, { autopilot: true, agentName: "Riya", tone: "friendly" });
    await tx.organizationProfile.upsert({
      where: { organizationId },
      create: {
        legalName: "Sharma Holidays",
        gstStateCode: "27",
        upiId: "sharma@okbank",
        bankName: "HDFC Bank",
        bankAccountName: "Sharma Holidays Private Limited",
        bankAccountNumber: "000123456789",
        bankIfsc: "HDFC0000001",
      },
      update: {
        gstStateCode: "27",
        upiId: "sharma@okbank",
        bankName: "HDFC Bank",
        bankAccountName: "Sharma Holidays Private Limited",
        bankAccountNumber: "000123456789",
        bankIfsc: "HDFC0000001",
      },
    });
    if (ready) {
      const answers = {
        cancellation: "Cancel 15 days before for a 50% refund.",
        refunds: "Refunds reach you in 7 working days.",
        id_documents: "Carry one government photo ID.",
        safety: "A trip leader stays with the group.",
        children: "Children above 5 are welcome.",
        payment_methods: "UPI or bank transfer.",
      };
      await saveAgencyAnswers(tx, owner, { answers });
    }
    await saveAgentBasics(tx, owner, { agentName: "Riya", tone: "friendly" });
    const destination = await tx.destination.create({ data: { name: "Kedarnath" }, select: { id: true } });
    const template = await tx.quoteTemplate.create({
      data: {
        name: "Kedarnath 4N",
        title: "Kedarnath Yatra 4N",
        kind: "group",
        destinationId: destination.id,
        nights: 4,
        startCity: "Delhi",
        pickupPoints: "Delhi - Kashmiri Gate, 9 pm\nHaridwar - Railway station, 5 am",
        roomTypes,
        advancePerPersonPaise: 200_000n,
        pricesIncludeGst: true,
        aiSellable: true,
      },
      select: { id: true },
    });
    const files = await tx.attachment.createManyAndReturn({
      data: [
        readyFile(PACKAGE_BROCHURE_RECORD_TYPE, template.id, "brochure.pdf", "application/pdf"),
        readyFile(PACKAGE_PHOTO_RECORD_TYPE, template.id, "one.jpg", "image/jpeg"),
        readyFile(PACKAGE_PHOTO_RECORD_TYPE, template.id, "two.jpg", "image/jpeg"),
        readyFile(AGENCY_PAYMENT_QR_RECORD_TYPE, organizationId, "qr.png", "image/png"),
      ],
      select: { id: true, contentType: true },
    });
    await tx.packageSeason.create({
      data: {
        templateId: template.id,
        label: "Winter",
        startsOn: day("2026-11-01"),
        endsOn: day("2026-12-31"),
        priceDoublePaise: 699_900n,
        priceTriplePaise: 599_900n,
        priceChildBedPaise: 399_900n,
      },
    });
    const departures: { id: string; startsOn: string; seats: number }[] = [];
    for (const [startsOn, seats] of [
      ["2026-11-14", 12],
      ["2026-11-21", 4],
    ] as const) {
      const row = await tx.departure.create({
        data: {
          title: "Batch",
          startDate: day(startsOn),
          endDate: day(startsOn),
          seatsTotal: seats,
          templateId: template.id,
        },
        select: { id: true },
      });
      departures.push({ id: row.id, startsOn, seats });
    }
    return { leadId: lead.id, packageId: template.id, destinationId: destination.id, departures, files };
  });
  // The files' bytes, so a turn that sends one can copy it onto its message inside storage.
  for (const file of ids.files) {
    await test.storage.put({
      key: `organizations/${organizationId}/attachments/${file.id}`,
      contentType: file.contentType,
      body: new Uint8Array([1, 2, 3]),
    });
  }
  const model = createMemoryAiModel();
  const logger = createMemoryLogger();
  /** Who owns the agency's leads, as identity says: the fixture's Owner, alone. */
  const identity = {
    firstOwner: () => Promise.resolve<string | null>(owner.userId),
    leadWorkers: () => Promise.resolve([{ userId: owner.userId, name: "Owner" }]),
    organizationProfile: () => Promise.resolve(null),
  };
  /**
   * A reply turn for the fixture's first message, or for `token` (a later message's id); `db` to watch its queries,
   * `identity` to stand in for who owns the agency's leads.
   */
  const turn = (
    at = liteTurnAt,
    options: {
      token?: string;
      traces?: TraceSink;
      db?: Database;
      identity?: typeof identity;
      entitlements?: Entitlements;
    } = {},
  ) =>
    runAgentTurn(
      {
        db: options.db ?? test.db,
        identity: options.identity ?? identity,
        ai: model,
        logger,
        subscriptions: { entitlementsOf: () => Promise.resolve(options.entitlements ?? liteEntitlements) },
        agencyName: () => Promise.resolve("Sharma Holidays"),
        files: test.files,
        managers: () => Promise.resolve([]),
        ...(options.traces === undefined ? {} : { traces: options.traces }),
      },
      { organizationId, conversationId: chat.id, kind: "reply", token: options.token ?? message.id },
      at,
    );
  /**
   * The minute job at `at`, or by the clock `at` reads (lead follow-up tasks, then the follow-ups due), for this agency
   * alone: the job visits every agency in the shared database, and only this one has the AI.
   */
  const nudges = (at: Date | (() => Date), traces?: TraceSink) =>
    runAiNudges(
      {
        db: test.db,
        identity,
        ai: model,
        logger,
        subscriptions: { entitlementsOf: (id) => Promise.resolve(id === organizationId ? liteEntitlements : null) },
        agencyName: () => Promise.resolve("Sharma Holidays"),
        files: test.files,
        managers: () => Promise.resolve([]),
        ...(traces === undefined ? {} : { traces }),
      },
      typeof at === "function" ? at : () => at,
    );
  return { organizationId, inOrg, owner, chat, message, ...ids, model, logger, identity, say, turn, nudges };
}
