// What the staff import's tests share: a staff import's page as the api answers it, and a query cache holding the
// answers a screen would ask for at the same time (the fake api answers one call at a time).
import type { AppRouter } from "@travel-crm/api";
import type { RoleSummary } from "@travel-crm/contracts/identity";
import type { ImportField, RowOutcome, RowReasonCode } from "@travel-crm/contracts/imports";
import type { QueryClient } from "@tanstack/react-query";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { createApiClient } from "@/data/trpc";
import type { StaffImportPage } from "@/organization/staff/import/use-staff-import";

export const importId = "0199e7a0-0000-7000-8000-0000000000aa";

export function aPage(overrides: Partial<StaffImportPage> = {}): StaffImportPage {
  return {
    id: importId,
    kind: "staff",
    status: "checked",
    fileName: "staff-list.csv",
    fileKind: "csv",
    sheet: null,
    sourceSheet: null,
    unreadableReason: null,
    failureReason: null,
    sameFile: null,
    columns: [],
    valueMatches: [],
    defaults: { stage: "new", ownerUserId: null, budgetBasis: null, roleKey: null },
    choices: { addBlocked: false, addAlreadyImported: false, addInCrm: false },
    counts: null,
    progress: { rowsTotal: 14, rowsToAdd: 12, rowsDone: 0, rowsAdded: 0, addRequestedAt: null },
    createdAt: "2026-10-19T11:00:00.000Z",
    checkedAt: "2026-10-19T11:01:00.000Z",
    finishedAt: null,
    keepUntil: "2026-10-26T11:00:00.000Z",
    report: null,
    seats: { free: 14 },
    added: [],
    ...overrides,
  };
}

/** A reason as the api sends it: a code with what it names, left out when it names nothing. */
interface ReasonFixture {
  code: RowReasonCode;
  field?: ImportField;
  row?: number;
  on?: string;
}

interface RowFixture {
  rowNumber: number;
  name: string | null;
  value: string | null;
  reasons: ReasonFixture[];
  outcome: RowOutcome | null;
}

export const aRow = (
  rowNumber: number,
  overrides: Partial<Omit<RowFixture, "reasons">> & { reasons?: readonly ReasonFixture[] } = {},
): RowFixture => ({
  rowNumber,
  name: `Person ${String(rowNumber)}`,
  value: `person${String(rowNumber)}`,
  outcome: null,
  ...overrides,
  reasons: [...(overrides.reasons ?? [])],
});

/** The rows the check step asks for, in the cache so they need no call of their own. */
export function seedRows(
  queryClient: QueryClient,
  rows: { new: readonly RowFixture[]; notAdded: readonly RowFixture[] },
): void {
  const trpc = createTRPCOptionsProxy<AppRouter>({ client: createApiClient(), queryClient });
  for (const [plan, items] of [
    ["new", rows.new],
    ["not_added", rows.notAdded],
  ] as const) {
    const input = { importId, plan, limit: 500 };
    queryClient.setQueryDefaults(trpc.staffImports.rows.queryKey(input), { staleTime: Infinity });
    queryClient.setQueryData(trpc.staffImports.rows.queryKey(input), { items: [...items], nextCursor: null });
  }
}

export const roles: RoleSummary[] = [
  { key: "org-owner", name: "Owner", isOwner: true, permissions: [], memberCount: 1 },
  { key: "sales", name: "Sales", isOwner: false, permissions: [], memberCount: 2 },
  { key: "operations", name: "Operations", isOwner: false, permissions: [], memberCount: 1 },
];

/** The agency's roles in the cache, as the Staff screen would have loaded them. */
export function seedRoles(queryClient: QueryClient): void {
  const trpc = createTRPCOptionsProxy<AppRouter>({ client: createApiClient(), queryClient });
  queryClient.setQueryDefaults(trpc.roles.list.queryKey(), { staleTime: Infinity });
  queryClient.setQueryData(trpc.roles.list.queryKey(), roles);
}

/** Radix's Select asks jsdom for what it lacks. */
export function allowSelects(): void {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
}
