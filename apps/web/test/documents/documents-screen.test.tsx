// The documents screen (spec 9.3): the organization's issued documents, newest first, a page at a time: number,
// document, when it was issued (in the organization's zone) and whether its PDF is ready, being prepared or can never
// be made, with the ready PDF a click away and its share links. A suspended organization's Owner may still take the
// PDFs and turn links off. A table on wide screens, a divided list on phones; honest when empty or when the list didn't
// load.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentsScreen } from "@/documents/documents-screen";
import { messages } from "@/i18n/messages";
import { loadPage } from "@/lib/navigate";
import { routes } from "@/lib/routes";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi, type Answer } from "../support/api-stub";
import { inputsSentTo } from "./sent";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

const words = messages.documents;

const document = (number: string, issuedAt: string, state: "ready" | "preparing" | "failed") => ({
  id: `0199e7a0-0000-7000-8000-00000000${number.slice(-4)}`,
  template: "sample",
  number,
  title: "Quotation",
  issuedAt,
  issuedBy: null,
  pdfAttachmentId: state === "ready" ? `0199e7a0-0000-7000-8000-0000000f${number.slice(-4)}` : null,
  renderedAt: state === "ready" ? issuedAt : null,
  renderFailed: state === "failed",
});

// 18:45 UTC on 15 October is already 16 October, 12:15 am, in India.
const latest = document("SMPL-2026-0003", "2026-10-15T18:45:00.000Z", "preparing");
const middle = document("SMPL-2026-0002", "2026-10-15T05:30:00.000Z", "failed");
const first = document("SMPL-2026-0001", "2026-10-14T05:30:00.000Z", "ready");

function renderScreen(answers: Record<string, Answer> = {}, subscription = paidSubscription) {
  const api = stubApi({
    "documents.list": { data: { documents: [latest, middle, first], nextCursor: null } },
    "documents.downloadLink": { data: { url: "https://files.example.test/one.pdf", expiresAt: first.issuedAt } },
    ...answers,
  });
  renderWithApi(<DocumentsScreen />, newQueryClient(subscription));
  return api;
}

beforeEach(() => {
  vi.mocked(loadPage).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DocumentsScreen", () => {
  it("is a table on wide screens, newest first, each with its status and times in the organization's zone", async () => {
    screenIs("wide");
    renderScreen();
    expect(await screen.findByRole("heading", { level: 1, name: words.list.title })).toBeVisible();
    const rows = (await screen.findAllByRole("row")).slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0]?.textContent)).toEqual([
      "SMPL-2026-0003",
      "SMPL-2026-0002",
      "SMPL-2026-0001",
    ]);
    const [newest, failed, ready] = rows;
    if (!newest || !failed || !ready) throw new Error("three rows expected");
    expect(within(newest).getByText(words.status.preparing)).toBeVisible();
    expect(within(newest).getByText(/^16 Oct, 12:15\sam$/)).toBeVisible();
    expect(within(failed).getByText(words.status.failed)).toBeVisible();
    expect(within(ready).getByText(words.status.ready)).toBeVisible();
    expect(within(ready).getByText("Quotation")).toBeVisible();
    // Only a rendered PDF can be downloaded.
    expect(within(newest).queryByRole("button", { name: /PDF/ })).toBeNull();
    expect(within(failed).queryByRole("button", { name: /PDF/ })).toBeNull();
  });

  it("downloads a ready PDF through a short-lived link", async () => {
    screenIs("wide");
    const user = userEvent.setup();
    renderScreen();
    await user.click(
      await screen.findByRole("button", { name: words.download.named.replace("{number}", "SMPL-2026-0001") }),
    );
    await waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith("https://files.example.test/one.pdf");
    });
    expect(inputsSentTo("documents.downloadLink")).toEqual([{ documentId: first.id }]);
  });

  it("opens a document's share links once its PDF is made, not before", async () => {
    screenIs("wide");
    const user = userEvent.setup();
    renderScreen({ "shareLinks.list": { data: [] } });
    const [preparing, failed] = (await screen.findAllByRole("row")).slice(1);
    if (!preparing || !failed) throw new Error("the preparing and failed documents' rows were expected");
    expect(within(preparing).queryByRole("button", { name: /^Share/ })).toBeNull();
    expect(within(failed).queryByRole("button", { name: /^Share/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: words.share.openNamed.replace("{number}", "SMPL-2026-0001") }));
    expect(
      await screen.findByRole("dialog", { name: words.share.title.replace("{number}", "SMPL-2026-0001") }),
    ).toBeVisible();
  });

  it("lets a suspended organization's Owner take the PDFs and turn links off, but not make new ones", async () => {
    screenIs("wide");
    const user = userEvent.setup();
    const link = {
      id: "0199e7a0-0000-7000-8000-00000000a011",
      recordType: "issued_document",
      recordId: first.id,
      label: "For Meera Iyer",
      createdBy: null,
      createdAt: first.issuedAt,
      expiresAt: null,
      revokedAt: null,
      openCount: 0,
      lastOpenedAt: null,
    };
    renderScreen(
      { "shareLinks.list": { data: [link] } },
      { ...paidSubscription, status: "suspended", access: "export_only" },
    );
    const named = (pattern: string) => pattern.replace("{number}", "SMPL-2026-0001");
    expect(await screen.findByRole("button", { name: named(words.download.named) })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: named(words.share.openNamed) }));
    const dialog = await screen.findByRole("dialog", { name: named(words.share.title) });
    expect(
      await within(dialog).findByRole("button", { name: words.share.revokeNamed.replace("{label}", "For Meera Iyer") }),
    ).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: words.share.create })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: words.share.create })).toHaveAccessibleDescription(
      messages.errors.reasons.ORGANIZATION_SUSPENDED,
    );
  });

  it("is a divided list on phones", async () => {
    screenIs("phone");
    renderScreen();
    await screen.findByText("SMPL-2026-0003");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("shows more documents a page at a time, after the last one shown", async () => {
    screenIs("wide");
    const user = userEvent.setup();
    // Every PDF settled, so the list isn't asking again on its own while the test changes the answer.
    const settled = { ...latest, pdfAttachmentId: first.pdfAttachmentId, renderedAt: latest.issuedAt };
    const api = renderScreen({ "documents.list": { data: { documents: [settled, middle], nextCursor: middle.id } } });
    await screen.findByText("SMPL-2026-0002");
    api.answer("documents.list", { data: { documents: [first], nextCursor: null } });
    await user.click(screen.getByRole("button", { name: words.list.more }));
    expect(await screen.findByText("SMPL-2026-0001")).toBeVisible();
    expect(inputsSentTo("documents.list").at(-1)).toEqual({ limit: 20, cursor: middle.id });
    expect(screen.queryByRole("button", { name: words.list.more })).toBeNull();
  });

  it("says what belongs here when there is nothing, and where to make the first", async () => {
    screenIs("wide");
    renderScreen({ "documents.list": { data: { documents: [], nextCursor: null } } });
    expect(await screen.findByText(words.list.empty)).toBeVisible();
    expect(screen.getByRole("link", { name: words.list.emptyAction })).toHaveAttribute("href", routes.branding);
    expect(screen.getByRole("link", { name: messages.settings.title })).toHaveAttribute("href", routes.settings);
  });

  it("offers a suspended organization's Owner no way into the screens shut to them", async () => {
    screenIs("wide");
    renderScreen(
      { "documents.list": { data: { documents: [], nextCursor: null } } },
      { ...paidSubscription, status: "suspended", access: "export_only" },
    );
    expect(await screen.findByText(words.list.empty)).toBeVisible();
    expect(screen.queryByRole("link", { name: words.list.emptyAction })).toBeNull();
    expect(screen.queryByRole("link", { name: messages.settings.title })).toBeNull();
  });

  it("says when the documents didn't load, and tries again", async () => {
    screenIs("wide");
    const user = userEvent.setup();
    const api = renderScreen({ "documents.list": { status: 500 } });
    expect(await screen.findByText(words.list.loadFailed)).toBeVisible();
    api.answer("documents.list", { data: { documents: [first], nextCursor: null } });
    await user.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByText("SMPL-2026-0001")).toBeVisible();
  });
});
