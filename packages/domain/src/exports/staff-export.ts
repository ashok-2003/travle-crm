// The staff export's listener (B52): the active staff, oldest first, into a file through runExport, named
// staff-yyyy-mm-dd on the agency's clock. Same formats, formula rule, job, file, 24 hours and downloads as the lead
// export. It has no filter and no row limit: an agency's staff is a few hundred people at most.
import { exportRequestedEvent } from "@travel-crm/contracts/exports";
import { staffExportHeaders, staffExportStatusWords } from "@travel-crm/contracts/identity";
import { internationalPhone } from "@travel-crm/contracts/kernel";
import type { WrittenCell } from "@travel-crm/integrations/spreadsheets";
import type { StaffExportRow } from "../identity/index.js";
import { defineListener, type EventListener } from "../jobs/index.js";
import type { ExportJobDependencies } from "./dependencies.js";
import { type ExportSource, runExport } from "./export-runner.js";

const kinds = ["text", "text", "text", "phone", "text", "date", "text", "date"] as const;

/** One person as the header row's columns, in order. */
export function staffExportCells(row: StaffExportRow): WrittenCell[] {
  return [
    row.name,
    row.username,
    row.email,
    row.phone === null ? null : internationalPhone(row.phone),
    row.roleName,
    row.joinedOn,
    row.mustChangePassword ? staffExportStatusWords.mustChangePassword : staffExportStatusWords.active,
    row.lastActiveOn,
  ];
}

function staffSource(dependencies: Pick<ExportJobDependencies, "identity">): ExportSource<null> {
  return {
    kind: "staff",
    requires: "staff:manage",
    sheetName: "Staff",
    columns: staffExportHeaders.map((header, index) => ({ header, kind: kinds[index] ?? "text" })),
    fileName: (stamp, format) => `staff-${stamp.day}.${format}`,
    filterOf: () => null,
    maxRows: null,
    count: async (_context, access) => (await dependencies.identity.staff.exportRows(access)).length,
    // All of it in one page: a few hundred people, in one read.
    page: async (_context, access) => ({
      rows: (await dependencies.identity.staff.exportRows(access)).map(staffExportCells),
      next: null,
    }),
    auditFilter: () => null,
    keptFilter: () => ({}),
  };
}

export function makeStaffExportListener(dependencies: ExportJobDependencies): EventListener {
  const source = staffSource(dependencies);
  return defineListener({
    name: "exports.make-staff-export",
    eventType: "export.requested",
    payload: exportRequestedEvent,
    handle: (event, context) => runExport(event, context, dependencies, source),
  });
}
