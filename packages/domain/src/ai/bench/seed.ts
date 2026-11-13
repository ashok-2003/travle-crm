// The invented agency every bench chat talks to: "Case Holidays", switched on for the lite agent, with its payment
// details and QR, answers to the six topics, a Manali group trip (two seasons, double and triple rooms, departures open,
// closed and nearly full), a Spiti group trip and a Kashmir custom trip. A case then picks which of them the AI may sell.
import type { benchPackages } from "@travel-crm/contracts/ai";
import {
  AGENCY_PAYMENT_QR_RECORD_TYPE,
  PACKAGE_BROCHURE_RECORD_TYPE,
  PACKAGE_PHOTO_RECORD_TYPE,
} from "@travel-crm/contracts/files";
import { saveOrganizationProfileInput } from "@travel-crm/contracts/profile";
import type { OrgTx } from "@travel-crm/db";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import { systemActor } from "../../kernel/index.js";
import { saveOrganizationProfile } from "../../profile/index.js";

/** The moment every case starts at: inside the first season's lead time, so the dates below are all ahead. */
export const BENCH_NOW = new Date("2026-11-06T10:00:00Z");
/** The owner the cases' leads belong to (the team is told through them). */
export const BENCH_OWNER_ID = "0192f3a0-0000-7000-8000-00000000c0de";

const day = (text: string) => new Date(`${text}T00:00:00Z`);

/** The agency's answer to its cancellation question, which a case may look for in a reply. */
export const BENCH_CANCELLATION = "Cancel 15 days before departure for a 50% refund.";

async function attach(
  tx: OrgTx,
  storage: ObjectStorage,
  record: { recordType: string; recordId: string },
  fileName: string,
  contentType: string,
) {
  const row = await tx.attachment.create({
    data: { ...record, fileName, contentType, sizeBytes: 3, status: "ready", confirmedAt: BENCH_NOW },
    select: { id: true, organizationId: true },
  });
  await storage.put({
    key: `organizations/${row.organizationId}/attachments/${row.id}`,
    contentType,
    body: new Uint8Array([1, 2, 3]),
  });
}

/** Switches the agency on for the lite agent and writes the shared packages; returns their ids by key. */
export async function seedBenchAgency(
  tx: OrgTx,
  organizationId: string,
  storage: ObjectStorage,
): Promise<{ key: (typeof benchPackages)[number]; id: string }[]> {
  // The seed overwrites the profile and payment details: it runs only in an empty organization the bench made.
  const holdsSomething =
    (await tx.organizationProfile.count()) +
    (await tx.destination.count()) +
    (await tx.quoteTemplate.count()) +
    (await tx.lead.count());
  if (holdsSomething > 0) throw new Error("The bench seeds only an empty organization of its own");
  // The group quote a booking makes needs the agency's GST state.
  await saveOrganizationProfile(
    tx,
    systemActor(organizationId),
    saveOrganizationProfileInput.parse({
      legalName: "Case Holidays Private Limited",
      gstin: "27AAPFU0939F1ZV",
      gstStateCode: "27",
      address: "4th floor, Sea View Chambers, Linking Road, Bandra West, Mumbai 400050",
      contactName: "Case Owner",
      contactPhone: "+919000000000",
      bankAccountName: "Case Holidays Private Limited",
      bankAccountNumber: "000123456789",
      bankIfsc: "HDFC0000001",
      bankName: "HDFC Bank",
      invoicePrefix: "CH",
      brandColour: null,
      documentTerms: null,
    }),
  );
  await tx.organizationProfile.update({ where: { organizationId }, data: { upiId: "caseholidays@okbank" } });
  await attach(
    tx,
    storage,
    { recordType: AGENCY_PAYMENT_QR_RECORD_TYPE, recordId: organizationId },
    "qr.png",
    "image/png",
  );
  await tx.aiSettings.create({ data: { enabled: true, scoring: true, fillLeads: false } });
  // A direct write, never an agency save: the lite switch is the console's, not the agency's.
  await tx.aiAutopilot.upsert({
    where: { organizationId },
    create: {
      organizationId,
      autopilot: true,
      lite: true,
      agentName: "Riya",
      tone: "friendly",
      answers: {
        cancellation: BENCH_CANCELLATION,
        refunds: "Refunds reach you in 7 working days.",
        id_documents: "Carry one government photo ID.",
        safety: "A trip leader stays with the group.",
        children: "Children above 5 are welcome.",
        payment_methods: "UPI or bank transfer.",
      },
    },
    update: {},
  });
  await tx.whatsappConnection.create({
    data: {
      integratedNumber: `9191${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
      displayNumber: "+919100000000",
      mode: "new_number",
      status: "connected",
      connectedAt: BENCH_NOW,
    },
  });
  const destination = async (name: string) =>
    (await tx.destination.create({ data: { name }, select: { id: true } })).id;
  const [manali, spiti, kashmir] = [
    await destination("Manali"),
    await destination("Spiti"),
    await destination("Kashmir"),
  ];
  const group = async (destinationId: string, name: string, advance: bigint) =>
    (
      await tx.quoteTemplate.create({
        data: {
          name,
          title: name,
          kind: "group",
          destinationId,
          roomTypes: ["double", "triple"],
          advancePerPersonPaise: advance,
          nights: 5,
          pickupPoints: "Chandigarh ISBT 17",
          startCity: "Chandigarh",
          summary: `${name} with a stay, transfers and sightseeing.`,
          inclusions: "Stay, breakfast and dinner, transfers",
          aiSellable: true,
        },
        select: { id: true },
      })
    ).id;
  const manaliTrip = await group(manali, "Manali Escape", 400_000n);
  const spitiTrip = await group(spiti, "Spiti Winter", 500_000n);
  const season = (
    templateId: string,
    label: string,
    startsOn: string,
    endsOn: string,
    double: bigint,
    triple: bigint,
  ) =>
    tx.packageSeason.create({
      data: {
        templateId,
        label,
        startsOn: day(startsOn),
        endsOn: day(endsOn),
        priceDoublePaise: double,
        priceTriplePaise: triple,
      },
    });
  await season(manaliTrip, "November", "2026-11-01", "2026-11-30", 699_900n, 599_900n);
  await season(manaliTrip, "Peak", "2026-12-20", "2027-01-05", 999_900n, 899_900n);
  await season(spitiTrip, "November", "2026-11-01", "2026-11-30", 799_900n, 699_900n);
  const departure = (templateId: string, title: string, start: string, seats: number, status = "open") =>
    tx.departure.create({
      data: { title, templateId, startDate: day(start), endDate: day(start), seatsTotal: seats, status },
    });
  await departure(manaliTrip, "Manali 14 Nov", "2026-11-14", 60);
  await departure(manaliTrip, "Manali 21 Nov", "2026-11-21", 60, "closed");
  await departure(manaliTrip, "Manali 28 Nov", "2026-11-28", 1);
  await departure(manaliTrip, "Manali 26 Dec", "2026-12-26", 60);
  await departure(spitiTrip, "Spiti 14 Nov", "2026-11-14", 60);
  const custom = await tx.quoteTemplate.create({
    data: {
      name: "Kashmir Classic",
      title: "Kashmir Classic",
      kind: "custom",
      destinationId: kashmir,
      nights: 6,
      fromPricePaise: 1_800_000n,
      aiSellable: true,
      summary: "Srinagar, Gulmarg and Pahalgam.",
    },
    select: { id: true },
  });
  const manaliFiles = (recordType: string) => ({ recordType, recordId: manaliTrip });
  await attach(tx, storage, manaliFiles(PACKAGE_BROCHURE_RECORD_TYPE), "manali.pdf", "application/pdf");
  await attach(tx, storage, manaliFiles(PACKAGE_PHOTO_RECORD_TYPE), "manali-one.jpg", "image/jpeg");
  await attach(tx, storage, manaliFiles(PACKAGE_PHOTO_RECORD_TYPE), "manali-two.jpg", "image/jpeg");
  await attach(
    tx,
    storage,
    { recordType: PACKAGE_BROCHURE_RECORD_TYPE, recordId: spitiTrip },
    "spiti.pdf",
    "application/pdf",
  );
  return [
    { key: "manali", id: manaliTrip },
    { key: "spiti", id: spitiTrip },
    { key: "kashmir", id: custom.id },
  ];
}
