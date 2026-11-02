// What the rates and packages journeys start from (release 7b): a supplier with seasons and rates, a package with tiers and a
// photo, the agency's public pages turned on, all made through the api as the signed-in Owner so every rule runs.
import { expect, type Page } from "@playwright/test";
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { addLeadThroughApi, callApi, dayInIndia, leadInput } from "./leads";

export async function aSupplier(page: Page, name = "Hotel Aurora", kind: "hotel" | "transport" = "hotel") {
  const { id } = await callApi<{ id: string }>(page, "suppliers.create", {
    kind,
    name,
    city: "Guptkashi",
    gstin: "",
    paymentTerms: "",
    paymentDetails: "",
    notes: "",
  });
  return id;
}

export async function aSeason(
  page: Page,
  supplierId: string,
  { label, from, to }: { label: string; from: number; to: number },
) {
  const { id } = await callApi<{ id: string }>(page, "suppliers.saveSeason", {
    supplierId,
    label,
    startsOn: dayInIndia(from),
    endsOn: dayInIndia(to),
  });
  return id;
}

export async function aRate(
  page: Page,
  seasonId: string,
  { item = "Deluxe room", costRupees, unit = "per_room_night" }: { item?: string; costRupees: number; unit?: string },
) {
  const { id } = await callApi<{ id: string }>(page, "suppliers.saveRate", {
    seasonId,
    item,
    mealPlan: "MAP",
    occupancy: "double",
    unit,
    costPaise: costRupees * 100,
    note: "",
  });
  return id;
}

/** The quote settings with the markup and minimum margin given, as a manager saves them. */
export async function saveMarginSettings(
  page: Page,
  { markupBasisPoints, minMarginBasisPoints }: { markupBasisPoints: number; minMarginBasisPoints: number | null },
) {
  await callApi(page, "quotes.saveSettings", {
    upiId: "",
    upiName: "",
    defaultTaxRateBasisPoints: 0,
    defaultTerms: "",
    defaultMarkupBasisPoints: markupBasisPoints,
    minMarginBasisPoints,
    minMarginPerPersonPaise: null,
  });
}

export async function aDraftQuote(
  page: Page,
  leadId: string,
  { title = "Kedarnath for four", startInDays }: { title?: string; startInDays: number | null },
) {
  const quote = await callApi<{ id: string }>(page, "quotes.create", {
    leadId,
    title,
    startDate: startInDays === null ? null : dayInIndia(startInDays),
    adults: 4,
    children: 0,
    days: [{ title: "Arrive in Guptkashi", description: "Check in and rest." }],
    items: [],
    inclusions: "Hotel, breakfast and dinner",
    exclusions: "Lunch",
    notes: "",
    taxRateBasisPoints: 0,
    placeOfSupply: null,
  });
  return quote.id;
}

export async function aLeadFor(page: Page, name = "Priya Nair", phone = "+919876500401") {
  return addLeadThroughApi(page, leadInput({ person: { name, phone } }));
}

/** A package kept from a quote under a name: the way the product makes one. Gives its id. */
export async function aPackage(page: Page, name = "Kedarnath yatra") {
  const leadId = await aLeadFor(page, "Template Lead", "+919876500499");
  const quoteId = await aDraftQuote(page, leadId, { title: name, startInDays: null });
  const { id } = await callApi<{ id: string }>(page, "quotes.savePackage", { quoteId, name });
  return id;
}

/** A one-pixel picture, which storage and the files module take as a photo. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Puts a photo on the package straight into storage, as the browser does, and confirms it. */
export async function aPhoto(page: Page, packageId: string) {
  const slot = await callApi<{
    attachmentId: string;
    upload: { url: string; method: string; headers: Record<string, string> };
  }>(page, "packages.requestPhotoUpload", {
    packageId,
    fileName: "kedarnath.png",
    contentType: "image/png",
    sizeBytes: PIXEL.length,
  });
  const headers = Object.fromEntries(
    Object.entries(slot.upload.headers).filter(([name]) => name.toLowerCase() !== "content-length"),
  );
  const put = await page.request.fetch(slot.upload.url, { method: slot.upload.method, headers, data: PIXEL });
  expect(put.ok(), `storage answered ${String(put.status())}`).toBe(true);
  await callApi(page, "packages.confirmPhoto", { packageId, attachmentId: slot.attachmentId });
}

export interface PackageWords {
  slug: string;
  /** A destination to give the package, so the departures at it are listed on its page. */
  destinationId?: string | null;
  summary?: string;
  priceRupees?: number;
}

/** Fills the package's page words, with a photo, turns the agency's pages on and publishes it. Gives the address path. */
export async function publishedPackage(page: Page, packageId: string, words: PackageWords, agencyCode: string) {
  await updatePackage(page, packageId, {
    slug: words.slug,
    destinationId: words.destinationId ?? null,
    nights: 5,
    summary: words.summary ?? "Five days to Kedarnath with hotels, meals and a guide.",
    highlights: ["Darshan at Kedarnath", "Stay in Guptkashi"],
    priceDisplay: words.priceRupees === undefined ? "on_enquiry" : "from",
    fromPricePaise: words.priceRupees === undefined ? null : words.priceRupees * 100,
    cancellationNotes: "Free to cancel 30 days before.",
  });
  await aPhoto(page, packageId);
  await callApi(page, "publicPages.save", {
    enabled: true,
    about: "A family agency in Dehradun, running yatras since 2009.",
    instagramUrl: "",
  });
  await callApi(page, "packages.setPublished", { packageId, published: true });
  return `/a/${agencyCode.toLowerCase()}/${words.slug}`;
}

/** A destination of the agency's, made the way one is: a lead names it. Gives its id. */
export async function aDestination(page: Page, name: string): Promise<string> {
  await addLeadThroughApi(
    page,
    leadInput({
      person: { name: `Asks for ${name}`, phone: `+9198765${String(Math.floor(10000 + Math.random() * 89999))}` },
      trip: { destination: { kind: "new", name } },
    }),
  );
  const found = await callApi<{ id: string; name: string }[]>(page, "destinations.search", { query: name });
  const one = found.find((destination) => destination.name === name);
  if (one === undefined) throw new Error(`${name} was not made`);
  return one.id;
}

/** Changes some of a package's words, keeping the rest as they are. */
export async function updatePackage(
  page: Page,
  packageId: string,
  changes: Partial<Omit<PackageDetail, "id" | "published" | "items" | "tiers" | "photoCount" | "gaps">>,
) {
  const detail = await callApi<PackageDetail>(page, "packages.get", { packageId });
  await callApi(page, "packages.update", {
    packageId,
    name: detail.name,
    title: detail.title,
    days: detail.days,
    inclusions: detail.inclusions,
    exclusions: detail.exclusions,
    notes: detail.notes,
    taxRateBasisPoints: detail.taxRateBasisPoints,
    slug: detail.slug,
    destinationId: detail.destinationId,
    nights: detail.nights,
    summary: detail.summary,
    highlights: detail.highlights,
    priceDisplay: detail.priceDisplay,
    fromPricePaise: detail.fromPricePaise,
    defaultTravellerLevel: detail.defaultTravellerLevel,
    cancellationNotes: detail.cancellationNotes,
    ...changes,
  });
}

/** A tier made through the api: its lines as the contract has them. */
export async function aTier(
  page: Page,
  packageId: string,
  name: string,
  lines: {
    description: string;
    rateId: string | null;
    quantityRule: string;
    quantity?: number;
    priceRupees?: number;
  }[],
) {
  const { id } = await callApi<{ id: string }>(page, "packages.saveTier", {
    packageId,
    name,
    lines: lines.map((line) => ({
      description: line.description,
      detail: "",
      rateId: line.rateId,
      quantityRule: line.quantityRule,
      quantity: line.quantity ?? 1,
      unitPricePaise: (line.priceRupees ?? 0) * 100,
    })),
  });
  return id;
}
