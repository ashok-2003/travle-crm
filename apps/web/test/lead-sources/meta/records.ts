// Facebook Pages as the api answers for them, for the Meta lead ads tests: the list and its items, a Page's page, its forms,
// a form's questions, the leads that couldn't be added, and the Pages a login shared.
import type {
  MetaConnectFinished,
  MetaFormList,
  MetaFormQuestionsView,
  MetaFormView,
  MetaPageDetail,
  MetaPageList,
  MetaPageListItem,
  MetaProblemList,
  MetaProblemView,
} from "@travel-crm/contracts/meta-leads";

export const pageRowId = "0199e7a0-0000-7000-8000-0000000000b1";
export const formRowId = "0199e7a0-0000-7000-8000-0000000000c1";

export function aPageItem(overrides: Partial<MetaPageListItem> = {}): MetaPageListItem {
  return {
    id: pageRowId,
    pageName: "Rajasthan Holidays",
    badge: "running",
    formsBroughtIn: 2,
    lastCheckedAt: "2026-10-23T05:12:00.000Z",
    ...overrides,
  };
}

export function aMetaList(overrides: Partial<MetaPageList> = {}): MetaPageList {
  return { items: [aPageItem()], limit: 5, configured: true, demo: false, ...overrides };
}

export function aPageDetail(overrides: Partial<MetaPageDetail> = {}): MetaPageDetail {
  return {
    id: pageRowId,
    pageName: "Rajasthan Holidays",
    status: "running",
    badge: "running",
    attentionSince: null,
    connectedBy: { userId: "0199a000-0000-7000-8000-000000000001", name: "Asha Sharma" },
    connectedAt: "2026-10-12T05:00:00.000Z",
    lastCheckedAt: "2026-10-23T05:12:00.000Z",
    tokenExpiresAt: null,
    checkRunning: false,
    late: false,
    readOnly: false,
    counts: { added: 214, mergedIntoExisting: 37, duplicates: 18, couldntBeAdded: 0 },
    ...overrides,
  };
}

export function aForm(overrides: Partial<MetaFormView> = {}): MetaFormView {
  return {
    id: formRowId,
    formId: "120000000000001",
    name: "Rajasthan winter ad",
    metaStatus: "ACTIVE",
    state: "running",
    leadsAdded: 1286,
    lastLeadAt: "2026-10-23T04:30:00.000Z",
    skippedLeads: 0,
    earlierImportId: null,
    ...overrides,
  };
}

export function aFormList(items: MetaFormView[] = [aForm()]): MetaFormList {
  return { items, readAt: "2026-10-23T05:10:00.000Z" };
}

export function aQuestionsView(overrides: Partial<MetaFormQuestionsView> = {}): MetaFormQuestionsView {
  return {
    form: aForm({ state: "not_brought_in", leadsAdded: 0, lastLeadAt: null }),
    questions: [
      {
        key: "full_name",
        type: "full_name",
        label: "Full name",
        example: null,
        field: "name",
        guessedBy: "standard",
        isNew: false,
      },
      {
        key: "phone_number",
        type: "phone",
        label: "Phone number",
        example: null,
        field: "phone",
        guessedBy: "standard",
        isNew: false,
      },
      {
        key: "where_do_you_want_to_go",
        type: "custom",
        label: "Where do you want to go?",
        example: null,
        field: "destination",
        guessedBy: "label",
        isNew: false,
      },
      {
        key: "any_other_wish",
        type: "custom",
        label: "Any other wish?",
        example: null,
        field: "note",
        guessedBy: null,
        isNew: false,
      },
    ],
    hasName: true,
    hasContact: true,
    ...overrides,
  };
}

export function aProblem(overrides: Partial<MetaProblemView> = {}): MetaProblemView {
  return {
    id: "0199e7a0-0000-7000-8000-0000000000d1",
    formName: "Rajasthan winter ad",
    reasons: ["phone_invalid"],
    exampleName: "Meena Iyer",
    platform: "instagram",
    firstSeenAt: "2026-10-22T05:00:00.000Z",
    ...overrides,
  };
}

export function aProblemList(items: MetaProblemView[] = [aProblem()], next: string | null = null): MetaProblemList {
  return { items, next };
}

export function aSharedList(overrides: Partial<MetaConnectFinished> = {}): MetaConnectFinished {
  return {
    pages: [
      { pageId: "100000000000001", name: "Rajasthan Holidays", availability: "available" },
      { pageId: "100000000000002", name: "Kerala Backwaters", availability: "connected_here" },
      { pageId: "100000000000003", name: "Goa Beach Escapes", availability: "connected_elsewhere" },
      { pageId: "100000000000004", name: "Someone Else's Page", availability: "not_allowed" },
    ],
    reconnectPageRowId: null,
    ...overrides,
  };
}
