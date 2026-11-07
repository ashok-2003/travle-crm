// The shared agency every test chat talks to: switched on for the grounded turn, with a Manali group trip (November and
// December-January peak seasons, double and triple rooms, departures open, closed and nearly full), a Spiti group trip, a
// Kashmir custom trip, a brochure and a payment QR in storage. A case then picks which of them the AI may sell.
import { PACKAGE_BROCHURE_RECORD_TYPE, PACKAGE_PAYMENT_QR_RECORD_TYPE } from "@travel-crm/contracts/files";
import { saveOrganizationProfileInput } from "@travel-crm/contracts/profile";
import type { OrgTx } from "@travel-crm/db";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import { systemActor } from "../../kernel/index.js";
import { saveOrganizationProfile } from "../../profile/index.js";

/** The moment every case runs at: inside the first season's lead time, so the dates below are all ahead. */
export const CASE_NOW = new Date("2026-11-06T10:00:00Z");
/** The owner the cases' leads belong to (the team is told through them). */
export const CASE_OWNER_ID = "0192f3a0-0000-7000-8000-00000000c0de";

const day = (text: string) => new Date(`${text}T00:00:00Z`);

interface SeededPackage {
  key: "manali" | "spiti" | "kashmir";
  id: string;
}

async function attach(
  tx: OrgTx,
  storage: ObjectStorage,
  packageId: string,
  recordType: string,
  fileName: string,
  contentType: string,
) {
  const row = await tx.attachment.create({
    data: {
      recordType,
      recordId: packageId,
      fileName,
      contentType,
      sizeBytes: 3,
      status: "ready",
      confirmedAt: CASE_NOW,
    },
    select: { id: true, organizationId: true },
  });
  await storage.put({
    key: `organizations/${row.organizationId}/attachments/${row.id}`,
    contentType,
    body: new Uint8Array([1, 2, 3]),
  });
}

/** Switches the agency on and writes the shared packages; returns their ids by key. */
export async function seedCaseAgency(
  tx: OrgTx,
  organizationId: string,
  storage: ObjectStorage,
): Promise<SeededPackage[]> {
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
  await tx.aiSettings.create({ data: { enabled: true, scoring: false, fillLeads: false } });
  await tx.aiAutopilot.create({
    // The case agency lets the AI hand a chat to a person when the customer asks for one ("asked").
    data: {
      autopilot: true,
      grounded: true,
      agentName: "Riya",
      handoff: "asked",
      paymentDetails: "Pay to UPI agency@bank",
    },
  });
  await tx.whatsappConnection.create({
    data: {
      integratedNumber: `9191${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
      displayNumber: "+919100000000",
      mode: "new_number",
      status: "connected",
      connectedAt: CASE_NOW,
    },
  });
  const destination = async (name: string) =>
    (await tx.destination.create({ data: { name }, select: { id: true } })).id;
  const [manali, spiti, kashmir] = [
    await destination("Manali"),
    await destination("Spiti"),
    await destination("Kashmir"),
  ];
  const group = async (
    key: SeededPackage["key"],
    destinationId: string,
    name: string,
    prices: { double: bigint; triple: bigint },
    options: { pickup: string; advance: bigint },
  ) => {
    const row = await tx.quoteTemplate.create({
      data: {
        name,
        title: name,
        kind: "group",
        destinationId,
        roomTypes: ["double", "triple"],
        advancePerPersonPaise: options.advance,
        nights: 5,
        pickupPoints: options.pickup,
        startCity: "Chandigarh",
        summary: `${name} with a stay, transfers and sightseeing.`,
        inclusions: "Stay, breakfast and dinner, transfers",
        aiSellable: true,
        paymentDetails: `Pay to UPI ${key}@bank`,
      },
      select: { id: true },
    });
    return { key, id: row.id, prices };
  };
  const manaliTrip = await group(
    "manali",
    manali,
    "Manali Escape",
    { double: 699_900n, triple: 599_900n },
    { pickup: "Chandigarh ISBT 17, call +91 98765 43210 on arrival", advance: 400_000n },
  );
  const spitiTrip = await group(
    "spiti",
    spiti,
    "Spiti Winter",
    { double: 799_900n, triple: 699_900n },
    { pickup: "Chandigarh ISBT 17", advance: 500_000n },
  );
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
  await season(manaliTrip.id, "November", "2026-11-01", "2026-11-30", 699_900n, 599_900n);
  await season(manaliTrip.id, "Peak", "2026-12-20", "2027-01-05", 999_900n, 899_900n);
  await season(spitiTrip.id, "November", "2026-11-01", "2026-11-30", 799_900n, 699_900n);
  const departure = (templateId: string, title: string, start: string, seats: number, status = "open") =>
    tx.departure.create({
      data: {
        title,
        templateId,
        startDate: day(start),
        endDate: day(start),
        seatsTotal: seats,
        status,
      },
    });
  await departure(manaliTrip.id, "Manali 14 Nov", "2026-11-14", 60);
  await departure(manaliTrip.id, "Manali 21 Nov", "2026-11-21", 60, "closed");
  await departure(manaliTrip.id, "Manali 28 Nov", "2026-11-28", 1);
  await departure(manaliTrip.id, "Manali 26 Dec", "2026-12-26", 60);
  await departure(spitiTrip.id, "Spiti 14 Nov", "2026-11-14", 60);
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
  await attach(tx, storage, manaliTrip.id, PACKAGE_PAYMENT_QR_RECORD_TYPE, "qr.png", "image/png");
  await attach(tx, storage, manaliTrip.id, PACKAGE_BROCHURE_RECORD_TYPE, "manali.pdf", "application/pdf");
  await attach(tx, storage, spitiTrip.id, PACKAGE_BROCHURE_RECORD_TYPE, "spiti.pdf", "application/pdf");
  return [
    { key: "manali", id: manaliTrip.id },
    { key: "spiti", id: spitiTrip.id },
    { key: "kashmir", id: custom.id },
  ];
}
