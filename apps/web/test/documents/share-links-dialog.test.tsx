// A document's share links (spec 9.3): each link's label, whether it works, how often it was opened and when last,
// and when it expires; a new link with a label and the default 30 days or never, its whole address shown once to copy;
// and turning one off after asking. A read-only organization makes no new links but may still turn one off.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareLinksDialog } from "@/documents/share-links-dialog";
import { messages } from "@/i18n/messages";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi, type Answer } from "../support/api-stub";
import { inputsSentTo } from "./sent";
import { subscriptionAnswer } from "./subscription";

const words = messages.documents.share;

const document = {
  id: "0199e7a0-0000-7000-8000-0000000000d1",
  template: "sample" as const,
  number: "SMPL-2026-0001",
  title: "Quotation",
  issuedAt: "2026-10-15T05:30:00.000Z",
  issuedBy: null,
  pdfAttachmentId: "0199e7a0-0000-7000-8000-0000000000f1",
  renderedAt: "2026-10-15T05:30:05.000Z",
  renderFailed: false,
};

const link = (label: string, extra: Record<string, unknown>) => ({
  id: `0199e7a0-0000-7000-8000-00000000${String(label.length).padStart(4, "0")}`,
  recordType: "issued_document",
  recordId: document.id,
  label,
  createdBy: "0199a000-0000-7000-8000-000000000001",
  createdAt: "2026-10-15T06:00:00.000Z",
  expiresAt: "2099-11-14T06:00:00.000Z",
  revokedAt: null,
  openCount: 0,
  lastOpenedAt: null,
  ...extra,
});

// 18:45 UTC on 15 October is 16 October, 12:15 am, in India.
const forMeera = link("For Meera Iyer", { openCount: 2, lastOpenedAt: "2026-10-15T18:45:00.000Z", expiresAt: null });
const turnedOff = link("Old link", { revokedAt: "2026-10-15T07:00:00.000Z" });
const expired = link("Last year's", { expiresAt: "2025-10-15T06:00:00.000Z" });
const token = `${"A".repeat(22)}${"b".repeat(43)}`;

function renderDialog(answers: Record<string, Answer> = {}) {
  const api = stubApi({
    "subscription.get": subscriptionAnswer(),
    "shareLinks.list": { data: [forMeera, turnedOff, expired] },
    "shareLinks.create": { data: { shareLinkId: forMeera.id, token, path: `/p/${token}` } },
    "shareLinks.revoke": { data: null },
    ...answers,
  });
  renderWithApi(<ShareLinksDialog document={document} open onOpenChange={vi.fn()} />, newQueryClient(null));
  return api;
}

const rowOf = (label: string) => {
  const row = screen.getByText(label).closest("li");
  if (!row) throw new Error(`no row for ${label}`);
  return row;
};

beforeEach(() => {
  screenIs("wide");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ShareLinksDialog", () => {
  it("lists the links with whether each works, its opens, the last one and its expiry", async () => {
    renderDialog();
    expect(await screen.findByRole("dialog", { name: words.title.replace("{number}", document.number) })).toBeVisible();
    await screen.findByText("For Meera Iyer");
    const meera = rowOf("For Meera Iyer");
    expect(within(meera).getByText(words.status.active)).toBeVisible();
    expect(within(meera).getByText(/^Opened 2 times, last 16 Oct, 12:15\sam$/)).toBeVisible();
    expect(within(meera).getByText(words.neverExpires)).toBeVisible();
    expect(within(rowOf("Old link")).getByText(words.status.revoked)).toBeVisible();
    expect(within(rowOf("Last year's")).getByText(words.status.expired)).toBeVisible();
    expect(within(rowOf("Last year's")).getByText("Not opened yet")).toBeVisible();
    // Only a working link can be turned off.
    expect(within(rowOf("Old link")).queryByRole("button")).toBeNull();
    expect(within(rowOf("Last year's")).queryByRole("button")).toBeNull();
  });

  it("makes a link with a label and the default 30 days, and shows its whole address once, to copy", async () => {
    const user = userEvent.setup();
    const api = renderDialog({ "shareLinks.list": { data: [] } });
    expect(await screen.findByText(words.none)).toBeVisible();
    expect(screen.getByLabelText(words.label)).toHaveValue("Quotation SMPL-2026-0001");
    expect(screen.getByRole("radio", { name: words.expiryDefault })).toBeChecked();
    await user.click(screen.getByRole("button", { name: words.create }));

    const address = new URL(`/p/${token}`, window.location.origin).href;
    expect(await screen.findByLabelText(words.linkLabel)).toHaveValue(address);
    expect(screen.getByText(words.onlyOnce)).toBeVisible();
    expect(screen.getByRole("button", { name: words.copyLink })).toBeVisible();
    expect(inputsSentTo("shareLinks.create")).toEqual([
      { recordType: "issued_document", recordId: document.id, label: "Quotation SMPL-2026-0001" },
    ]);

    const listed = api.calls.filter((path) => path === "shareLinks.list").length;
    await user.click(screen.getByRole("button", { name: words.done }));
    expect(screen.queryByLabelText(words.linkLabel)).toBeNull();
    await waitFor(() => {
      expect(api.calls.filter((path) => path === "shareLinks.list").length).toBeGreaterThan(listed);
    });
  });

  it("makes a link that never expires", async () => {
    const user = userEvent.setup();
    renderDialog({ "shareLinks.list": { data: [] } });
    await screen.findByText(words.none);
    const label = screen.getByLabelText(words.label);
    await user.clear(label);
    await user.type(label, "For Meera Iyer");
    await user.click(screen.getByRole("radio", { name: words.expiryNever }));
    await user.click(screen.getByRole("button", { name: words.create }));
    await waitFor(() => {
      expect(inputsSentTo("shareLinks.create")).toEqual([
        { recordType: "issued_document", recordId: document.id, label: "For Meera Iyer", expiresAt: null },
      ]);
    });
  });

  it("asks for a label before sending anything", async () => {
    const user = userEvent.setup();
    const api = renderDialog({ "shareLinks.list": { data: [] } });
    await screen.findByText(words.none);
    await user.clear(screen.getByLabelText(words.label));
    await user.click(screen.getByRole("button", { name: words.create }));
    expect(await screen.findByText(words.labelInvalid)).toBeVisible();
    expect(api.calls).not.toContain("shareLinks.create");
  });

  it("shows a refusal as its sentence", async () => {
    const user = userEvent.setup();
    renderDialog({ "shareLinks.create": { status: 404, reason: "DOCUMENT_NOT_FOUND" } });
    await user.click(await screen.findByRole("button", { name: words.create }));
    expect(await screen.findByText(messages.errors.reasons.DOCUMENT_NOT_FOUND)).toBeVisible();
  });

  it("turns a link off after asking", async () => {
    const user = userEvent.setup();
    const api = renderDialog();
    await user.click(
      await screen.findByRole("button", { name: words.revokeNamed.replace("{label}", "For Meera Iyer") }),
    );
    expect(screen.getByText(words.revokeDescription)).toBeVisible();
    api.answer("shareLinks.list", { data: [{ ...forMeera, revokedAt: "2026-10-16T05:00:00.000Z" }] });
    await user.click(screen.getByRole("button", { name: words.revokeConfirm }));
    await waitFor(() => {
      expect(inputsSentTo("shareLinks.revoke")).toEqual([{ shareLinkId: forMeera.id }]);
    });
    await waitFor(() => {
      expect(within(rowOf("For Meera Iyer")).getByText(words.status.revoked)).toBeVisible();
    });
  });

  it("makes no new link in a read-only organization, saying why, but still turns one off", async () => {
    renderDialog({ "subscription.get": subscriptionAnswer("read_only") });
    expect(await screen.findByText(messages.errors.reasons.ORGANIZATION_READ_ONLY)).toBeVisible();
    expect(screen.getByRole("button", { name: words.create })).toBeDisabled();
    expect(screen.getByRole("button", { name: words.revokeNamed.replace("{label}", "For Meera Iyer") })).toBeEnabled();
  });
});
