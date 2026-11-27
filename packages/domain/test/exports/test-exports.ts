// What the exports module's tests share: the imports' test harness, a requester, a fake identity, a source of three
// test rows, and the export.requested event the worker would hand the runner.
import type { DomainEvent } from "../../src/jobs/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import type { ExportIdentity, ExportJobDependencies, ExportSource } from "../../src/exports/index.js";
import type { TestImports } from "../imports/support/test-imports.js";

export interface TestFilter {
  stage: string;
  ownerUserId: string | null;
  search: string | null;
}

/** Three leads in two pages, filtered by nothing: the runner's part is under test, not a real query's. */
export function testSource(overrides: Partial<ExportSource<TestFilter>> = {}): ExportSource<TestFilter> & {
  pagesAsked: (string | null)[];
} {
  const pagesAsked: (string | null)[] = [];
  return {
    pagesAsked,
    kind: "leads",
    requires: "leads:view",
    sheetName: "Leads",
    columns: [
      { header: "Name", kind: "text" },
      { header: "Adults", kind: "number" },
    ],
    fileName: (stamp, format) => `leads-${stamp.day}-${stamp.time.replace(":", "")}.${format}`,
    filterOf: (stored) => stored as TestFilter,
    maxRows: 10,
    count: () => Promise.resolve(3),
    page: (_context, _access, _filter, after) => {
      pagesAsked.push(after);
      return Promise.resolve(
        after === null
          ? {
              rows: [
                ["Asha", 2],
                ["=Ravi", 1],
              ],
              next: "2",
            }
          : { rows: [["Meera", null]], next: null },
      );
    },
    auditFilter: (filter) => ({
      stage: filter.stage,
      ownerUserId: filter.ownerUserId,
      ...(filter.search === null ? {} : { searched: true }),
    }),
    keptFilter: (filter) => ({ ...filter, search: null }),
    ...overrides,
  };
}

export function fakeExportIdentity(access: MemberAccess | null): ExportIdentity {
  const unexpected = () => Promise.reject(new Error("Not part of this test"));
  return {
    resolveAccess: () => Promise.resolve(access),
    memberContacts: () => Promise.resolve([]),
    staff: {
      list: unexpected,
      create: unexpected,
      changePhone: unexpected,
      rowFacts: unexpected,
      seatsFree: unexpected,
      hashTemporaryPasswords: unexpected,
      addImported: unexpected,
      exportRows: unexpected,
      updateRole: unexpected,
      resetPassword: unexpected,
      resetTemporaryPassword: unexpected,
      remove: unexpected,
    },
  };
}

export function exportDependencies(test: TestImports, access: MemberAccess | null): ExportJobDependencies {
  return {
    files: test.files,
    spreadsheets: test.spreadsheets,
    identity: fakeExportIdentity(access),
    appUrl: "https://app.example.test",
  };
}

export const requested = (organizationId: string, exportId: string, kind: "leads" | "staff" = "leads") =>
  ({
    id: crypto.randomUUID(),
    organizationId,
    type: "export.requested",
    payload: { exportId, kind },
    occurredAt: new Date(),
  }) satisfies DomainEvent<{ exportId: string; kind: "leads" | "staff" }>;
