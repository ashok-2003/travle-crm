// Fixtures for the AI change box's tests: a proposal with one clean change, one flagged, one question, and a way to render the card.
import type {
  ProposedChange as PackageChange,
  ProposedChanges as PackageChangeProposal,
} from "@/packages/ai-changes/use-package-changes-ai";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@travel-crm/api";
import { createApiClient } from "@/data/trpc";
import { newQueryClient, paidSubscription } from "../organization/api";

export const packageId = "0190a000-0000-7000-8000-000000000001";
export const runId = "0190a000-0000-7000-8000-0000000000aa";
const none = { double: null, single: null, triple: null, quad: null, child_bed: null, child_no_bed: null };

export const priceChange: PackageChange = {
  id: "c1",
  kind: "season_change",
  evidence: [],
  flags: [],
  seasonIds: ["0190a000-0000-7000-8000-0000000000a1"],
  label: "Regular",
  before: { label: "Regular", prices: { ...none, double: 1_200_000 } },
  prices: { ...none, double: 1_300_000 },
};
export const flaggedChange: PackageChange = {
  id: "c2",
  kind: "departure_cancel",
  evidence: [],
  flags: ["has_bookings"],
  departureId: "0190a000-0000-7000-8000-0000000000d1",
  startDate: "2027-12-12",
  reason: "",
};
export const seatsChange: PackageChange = {
  id: "c3",
  kind: "trip_field",
  evidence: [],
  flags: [],
  field: "seatsPerDeparture",
  before: 12,
  value: 15,
};

export const proposal = (
  changes: PackageChange[],
  more: Partial<PackageChangeProposal> = {},
): PackageChangeProposal => ({
  runId,
  changes,
  questions: [],
  ignored: [],
  notChanged: [],
  brochureLeftOut: false,
  ...more,
});

/** A query cache where the plan has the AI and the agency has it on. */
export function aiQueryClient() {
  const queryClient = newQueryClient({ ...paidSubscription, modules: ["crm", "ai"] });
  const trpc = createTRPCOptionsProxy<AppRouter>({ client: createApiClient(), queryClient });
  queryClient.setQueryData(trpc.ai.status.queryKey(), { enabled: true });
  return queryClient;
}
