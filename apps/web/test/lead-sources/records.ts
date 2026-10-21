// Sheets as the api answers for them, for the Lead sources tests: a list's items and its settings, a sheet's page.
import type { SheetColumnsView, SheetDetail, SheetList, SheetListItem } from "@travel-crm/contracts/sheets";

export const sheetId = "0199e7a0-0000-7000-8000-0000000000e1";
export const address = "crm-sheets@travelcrm-test.iam.gserviceaccount.com";

export function aSheetItem(overrides: Partial<SheetListItem> = {}): SheetListItem {
  return {
    id: sheetId,
    sheetTitle: "Goa Diwali campaign",
    tabTitle: "Form responses 1",
    status: "running",
    attentionState: null,
    lastCheckedAt: "2026-10-19T05:12:00.000Z",
    ...overrides,
  };
}

export function aSheetList(overrides: Partial<SheetList> = {}): SheetList {
  return {
    items: [aSheetItem()],
    limit: 5,
    serviceAccountEmails: [address],
    configured: true,
    demo: false,
    ...overrides,
  };
}

export function aSheetDetail(overrides: Partial<SheetDetail> = {}): SheetDetail {
  return {
    id: sheetId,
    sheetTitle: "Goa Diwali campaign",
    tabTitle: "Form responses 1",
    tabGid: "0",
    status: "running",
    step: "done",
    attentionState: null,
    attentionSince: null,
    connectedBy: { userId: "0199a000-0000-7000-8000-000000000001", name: "Asha Sharma" },
    connectedAt: "2026-10-12T05:00:00.000Z",
    serviceAccountEmail: address,
    lastCheckedAt: "2026-10-19T05:12:00.000Z",
    checkRunning: false,
    late: false,
    readOnly: false,
    rowsTruncated: false,
    counts: { added: 214, mergedIntoExisting: 37, duplicates: 18, couldntBeAdded: 3 },
    columns: { matched: 6, total: 9, newUnmatched: [], missing: [] },
    existingRows: "only_new",
    existingImportId: null,
    defaultOwnerName: "Asha Sharma",
    ...overrides,
  };
}

export function aColumnsView(overrides: Partial<SheetColumnsView> = {}): SheetColumnsView {
  return {
    sheetTitle: "Goa Diwali campaign (Responses)",
    tabs: [{ gid: "0", title: "Form responses 1" }],
    tabGid: "0",
    rowCount: 1286,
    columns: [
      {
        headerKey: "timestamp",
        header: "Timestamp",
        samples: ["19/10/2026 14:32:10"],
        field: "enquiry_date",
        guessedBy: "form",
        isNew: false,
      },
      {
        headerKey: "fullname",
        header: "Full name",
        samples: ["Priya Nair", "Rahul Sharma"],
        field: "name",
        guessedBy: "form",
        isNew: false,
      },
      {
        headerKey: "whatsapp",
        header: "WhatsApp number",
        samples: ["98450 12345"],
        field: "phone",
        guessedBy: "common-name",
        isNew: false,
      },
      {
        headerKey: "handledby",
        header: "Handled by",
        samples: ["Asha", "Neha"],
        field: null,
        guessedBy: null,
        isNew: false,
      },
    ],
    ownerValues: null,
    ...overrides,
  };
}
