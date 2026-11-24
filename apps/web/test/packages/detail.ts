// A package as packages.get answers, and one of its departures as departures.list does, for the editor's component tests.
import type { DepartureSummary } from "@travel-crm/contracts/departures";
import type { PackageDetail } from "@travel-crm/contracts/quotes";

export function aPackage(changes: Partial<PackageDetail> = {}): PackageDetail {
  return {
    id: "0190a000-0000-7000-8000-000000000001",
    name: "Kedarnath 6 days",
    title: "Kedarnath Yatra",
    days: [],
    inclusions: "",
    exclusions: "",
    notes: "",
    taxRateBasisPoints: 500,
    slug: "kedarnath",
    destinationId: null,
    nights: 5,
    summary: "",
    highlights: [],
    priceDisplay: "from",
    fromPricePaise: null,
    defaultTravellerLevel: null,
    cancellationNotes: "",
    kind: "custom",
    roomTypes: [],
    pricesIncludeGst: true,
    advancePerPersonPaise: null,
    pickupPoints: "",
    startCity: "",
    weeklyDays: [],
    departureMonths: [],
    seatsPerDeparture: null,
    published: false,
    destinationName: null,
    items: [],
    tiers: [],
    seasons: [],
    photoCount: 0,
    gaps: [],
    sellable: false,
    sellGaps: [],
    pagesEnabled: true,
    agencyCode: "acme",
    ...changes,
  };
}

export function aDeparture(startDate: string, changes: Partial<DepartureSummary> = {}): DepartureSummary {
  return {
    id: "0190a000-0000-7000-8000-0000000000d1",
    title: "Trip",
    destinationName: null,
    startDate,
    endDate: startDate,
    pricePaise: null,
    status: "open",
    state: "open",
    seatsTotal: 10,
    sold: 6,
    held: 0,
    free: 4,
    overbookedBy: 0,
    ...changes,
  };
}
