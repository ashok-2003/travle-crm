// A drafted package as the api answers "draft": one price the documents disagree on, one figure to check, and a field they never say.
import type { PackageDraft, SourceRef } from "@travel-crm/contracts/ai";

export const line = (token: string, excerpt: string, source = "Spiti brochure"): SourceRef => ({
  token,
  source,
  excerpt,
});

const some = <T>(value: T, ...evidence: SourceRef[]) => ({ value, evidence, checkThis: false });
const none = { value: null, evidence: [], checkThis: false };

export const draft: PackageDraft = {
  fillId: "0199a000-0000-7000-8000-0000000000f2",
  tripRef: "t1",
  name: some("Spiti Winter 7N", line("L1", "Spiti Winter Expedition 7N/8D")),
  title: some("Spiti Winter Expedition", line("L1", "Spiti Winter Expedition 7N/8D")),
  destination: some("Spiti", line("L2", "Kaza, Spiti Valley")),
  destinationId: null,
  nights: some(7, line("L1", "Spiti Winter Expedition 7N/8D")),
  roomTypes: some(["double", "triple"], line("L3", "Double or triple sharing")),
  weeklyDays: [some([5], line("L4", "Departs every Friday"))],
  departureMonths: some([12, 1, 2], line("L5", "December to February")),
  seasons: [
    {
      label: some("Winter", line("L6", "Winter season")),
      startsOn: "2026-12-01",
      endsOn: "2027-02-28",
      prices: {
        single: [],
        double: [
          some(699900, line("L7", "Double sharing Rs 6,999 per person", "Spiti brochure")),
          some(749900, line("L8", "Twin: 7,499 per head", "Rate email")),
        ],
        triple: [{ value: 650000, evidence: [line("L9", "Triple sharing about 6,500")], checkThis: true }],
        quad: [],
        child_bed: [],
        child_no_bed: [],
      },
    },
  ],
  pricesIncludeGst: some(false, line("L10", "Plus 5% GST")),
  advancePerPersonPaise: [some(500000, line("L11", "Advance Rs 5,000 per person"))],
  pickupPoints: none,
  startCity: some("Chandigarh", line("L12", "Starts from Chandigarh")),
  inclusions: some("Hotels, breakfast and dinner", line("L13", "Hotels, breakfast and dinner included")),
  exclusions: none,
  cancellationNotes: none,
  summary: none,
  highlights: some(["Key Monastery", "Chandratal"], line("L14", "Key Monastery; Chandratal")),
  days: [some({ title: "Chandigarh to Shimla", description: "Drive up." }, line("L15", "Day 1 Chandigarh to Shimla"))],
  brochureKnowledgeId: null,
};
