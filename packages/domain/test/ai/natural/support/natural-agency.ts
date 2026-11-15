// The agency the natural agent's database tests start from: the bench's agency T (two treks, Saturday batches in
// December, the six answers, a UPI ID and a QR), the AI on, agent Riya, tone friendly. Invented data.
import { AGENCY_PAYMENT_QR_RECORD_TYPE, PACKAGE_BROCHURE_RECORD_TYPE } from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import { createMemoryAiModel, type MemoryAiModel } from "@travel-crm/integrations/ai";
import { saveAgencyAnswers, saveAgentBasics, saveAiSettings } from "../../../../src/ai/index.js";
import { memberOf } from "../../../imports/support/test-imports.js";
import { aConnectedAgency, testNow, type TestInbox } from "../../../inbox/support.js";
import { storeAutopilot } from "../../support/store-autopilot.js";

export const NATURAL_UPI = "casetrips@okhdfc";

interface TripSeed {
  /** The internal name: it sets the saved order (sellablePackages sorts by it), so T1 sorts first. */
  name: string;
  title: string;
  place: string;
  startCity: string;
  pickupPoints: string;
  days: { title: string; description: string }[];
  triplePaise: bigint;
  departures: string[];
  brochure: boolean;
}

const kedarkantha: TripSeed = {
  name: "01 Kedarkantha",
  title: "Kedarkantha Trek",
  place: "Sankri, Uttarakhand",
  startCity: "Dehradun",
  pickupPoints: "Dehradun ISBT, 6:30 am\nDehradun railway station, 7 am",
  days: [
    { title: "Dehradun to Sankri", description: "Drive 220 km, 8 to 9 hours." },
    { title: "Sankri to Juda ka Talab", description: "A 4 km climb through pine forest." },
    { title: "Juda ka Talab to Kedarkantha base", description: "Camp in the snow." },
    { title: "Kedarkantha summit (3,800 m) and back", description: "Start at 3 am for the sunrise." },
    { title: "Sankri to Dehradun", description: "Reach Dehradun by 7 pm." },
  ],
  triplePaise: 949_900n,
  departures: ["2026-12-05", "2026-12-12", "2026-12-19", "2026-12-26"],
  brochure: true,
};
const brahmatal: TripSeed = {
  name: "02 Brahmatal",
  title: "Brahmatal Trek",
  place: "Lohajung, Uttarakhand",
  startCity: "Kathgodam",
  pickupPoints: "Kathgodam railway station, 6 am",
  days: [
    { title: "Kathgodam to Lohajung", description: "Drive 210 km, 9 hours." },
    { title: "Lohajung to Bekaltal", description: "A 6 km walk." },
    { title: "Brahmatal summit and back", description: "Views of Trishul and Nanda Ghunti." },
  ],
  triplePaise: 1_049_900n,
  departures: ["2026-12-12", "2026-12-26"],
  brochure: false,
};
/** More treks, past the two of agency T, for tests that need many. */
const another = (number: number): TripSeed => ({
  name: `${String(number).padStart(2, "0")} Trek ${String(number)}`,
  title: `Himalayan Trek ${String(number)}`,
  place: `Valley ${String(number)}`,
  startCity: "Dehradun",
  pickupPoints: "Dehradun ISBT, 6 am",
  days: [{ title: `Dehradun to Valley ${String(number)}`, description: "Drive 200 km." }],
  triplePaise: 800_000n + BigInt(number) * 10_000n,
  departures: ["2026-12-12"],
  brochure: false,
});

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

async function seedTrip(tx: OrgTx, trip: TripSeed): Promise<string> {
  const destination = await tx.destination.create({ data: { name: trip.place }, select: { id: true } });
  const { id } = await tx.quoteTemplate.create({
    data: {
      name: trip.name,
      title: trip.title,
      kind: "group",
      destinationId: destination.id,
      nights: 5,
      startCity: trip.startCity,
      pickupPoints: trip.pickupPoints,
      days: trip.days,
      summary: `${trip.title}: a winter trek with snow camps.`,
      highlights: ["Summit sunrise", "Snow camps"],
      inclusions: "Tents, meals on the trek and a certified trek leader.",
      exclusions: "Personal gear.",
      notes: "Carry warm layers.",
      cancellationNotes: "50% back up to 15 days before.",
      roomTypes: ["triple"],
      advancePerPersonPaise: 300_000n,
      pricesIncludeGst: true,
      aiSellable: true,
    },
    select: { id: true },
  });
  await tx.packageSeason.create({
    data: {
      templateId: id,
      label: "Winter",
      startsOn: day("2026-11-01"),
      endsOn: day("2026-12-31"),
      priceTriplePaise: trip.triplePaise,
    },
  });
  for (const startsOn of trip.departures) {
    await tx.departure.create({
      data: { title: "Batch", startDate: day(startsOn), endDate: day(startsOn), seatsTotal: 20, templateId: id },
    });
  }
  if (trip.brochure) {
    await tx.attachment.create({
      data: readyFile(PACKAGE_BROCHURE_RECORD_TYPE, id, "brochure.pdf", "application/pdf"),
    });
  }
  return id;
}

/** `trips` group packages (2 by default: Kedarkantha, then Brahmatal, then more); payment details unless told not. */
export async function naturalAgency(
  test: TestInbox,
  options: { trips?: number; paymentDetails?: boolean } = {},
): Promise<{ organizationId: string; packageIds: string[]; model: MemoryAiModel }> {
  const { trips = 2, paymentDetails = true } = options;
  const { organizationId } = await aConnectedAgency(test);
  const owner = memberOf(organizationId, "org-owner");
  const packageIds = await test.db.forOrg(organizationId, async (tx) => {
    await saveAiSettings(tx, owner, { enabled: true, scoring: true }, { providerReady: true, now: testNow });
    await storeAutopilot(tx, organizationId, { autopilot: true, agentName: "Riya", tone: "friendly" });
    await saveAgentBasics(tx, owner, { agentName: "Riya", tone: "friendly" });
    await saveAgencyAnswers(tx, owner, {
      answers: {
        safety: "A certified trek leader, oxygen on every trek, and separate tents for women.",
        children: "10 and above, with a parent.",
        cancellation: "50% back up to 15 days before; nothing after.",
        refunds: "Refunds reach you in 7 working days.",
        id_documents: "Carry one government photo ID.",
        payment_methods: "UPI or bank transfer.",
      },
    });
    if (paymentDetails) {
      await tx.organizationProfile.upsert({
        where: { organizationId },
        create: { legalName: "Case Trips", gstStateCode: "05", upiId: NATURAL_UPI },
        update: { upiId: NATURAL_UPI },
      });
      await tx.attachment.create({
        data: readyFile(AGENCY_PAYMENT_QR_RECORD_TYPE, organizationId, "qr.png", "image/png"),
      });
    }
    const seeds = Array.from({ length: trips }, (_, index) =>
      index === 0 ? kedarkantha : index === 1 ? brahmatal : another(index + 1),
    );
    const ids: string[] = [];
    for (const seed of seeds) ids.push(await seedTrip(tx, seed));
    return ids;
  });
  return { organizationId, packageIds, model: createMemoryAiModel() };
}
