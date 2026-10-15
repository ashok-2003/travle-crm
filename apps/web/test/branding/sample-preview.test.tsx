// "Preview on a sample quotation" (spec 9.3): issues a sample with the branding as it is saved, says while the worker
// prepares its PDF, then downloads it through a short-lived link. A refusal shows its sentence; a sample whose PDF can
// never be made says so; in a read-only organization the preview is disabled with the reason.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SamplePreview } from "@/branding/sample-preview";
import { messages } from "@/i18n/messages";
import { loadPage } from "@/lib/navigate";
import { routes } from "@/lib/routes";
import { newQueryClient, renderWithApi } from "../organization/api";
import { stubApi, type Answer } from "../support/api-stub";
import { inputsSentTo } from "../documents/sent";
import { subscriptionAnswer } from "../documents/subscription";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

const words = messages.documents.sample;

const preparing = {
  id: "0199e7a0-0000-7000-8000-0000000000d1",
  template: "sample",
  number: "SMPL-2026-0001",
  title: "Quotation",
  issuedAt: "2026-10-15T05:30:00.000Z",
  issuedBy: "0199a000-0000-7000-8000-000000000001",
  pdfAttachmentId: null,
  renderedAt: null,
  renderFailed: false,
};
const ready = { ...preparing, pdfAttachmentId: "0199e7a0-0000-7000-8000-0000000000f1", renderedAt: preparing.issuedAt };
const link = { url: "https://files.example.test/SMPL-2026-0001.pdf?signature=1", expiresAt: "2026-10-15T05:35:00Z" };

function renderPreview(answers: Record<string, Answer> = {}) {
  const api = stubApi({
    "subscription.get": subscriptionAnswer(),
    "documents.issueSample": { data: preparing },
    "documents.get": { data: preparing },
    "documents.downloadLink": { data: link },
    ...answers,
  });
  renderWithApi(<SamplePreview />, newQueryClient());
  return api;
}

beforeEach(() => {
  vi.mocked(loadPage).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SamplePreview", () => {
  it("issues a sample, says while its PDF is prepared, then downloads it", async () => {
    const user = userEvent.setup();
    const api = renderPreview();
    await user.click(screen.getByRole("button", { name: words.issue }));
    expect(await screen.findByText(words.preparing.replace("{number}", "SMPL-2026-0001"))).toBeVisible();
    expect(screen.queryByRole("button", { name: words.download })).toBeNull();

    // The worker renders it moments later; the screen asks again until it has.
    api.answer("documents.get", { data: ready });
    expect(
      await screen.findByText(words.ready.replace("{number}", "SMPL-2026-0001"), {}, { timeout: 5000 }),
    ).toBeVisible();
    expect(inputsSentTo("documents.get")).toContainEqual({ documentId: preparing.id });
    expect(screen.getByRole("link", { name: words.allDocuments })).toHaveAttribute("href", routes.documents);

    await user.click(screen.getByRole("button", { name: words.download }));
    await waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith(link.url);
    });
    expect(inputsSentTo("documents.downloadLink")).toEqual([{ documentId: preparing.id }]);
  });

  it("says when the sample's PDF can never be made", async () => {
    const user = userEvent.setup();
    renderPreview({ "documents.get": { data: { ...preparing, renderFailed: true } } });
    await user.click(screen.getByRole("button", { name: words.issue }));
    expect(await screen.findByText(words.failed.replace("{number}", "SMPL-2026-0001"))).toBeVisible();
    expect(screen.queryByRole("button", { name: words.download })).toBeNull();
  });

  it("shows a refusal as its sentence", async () => {
    const user = userEvent.setup();
    renderPreview({ "documents.issueSample": { status: 409, reason: "PROFILE_NOT_SAVED" } });
    await user.click(screen.getByRole("button", { name: words.issue }));
    expect(await screen.findByText(messages.errors.reasons.PROFILE_NOT_SAVED)).toBeVisible();
  });

  it("disables the preview in a read-only organization, saying why", async () => {
    renderPreview({ "subscription.get": subscriptionAnswer("read_only") });
    expect(await screen.findByText(messages.errors.reasons.ORGANIZATION_READ_ONLY)).toBeVisible();
    expect(screen.getByRole("button", { name: words.issue })).toBeDisabled();
  });
});
