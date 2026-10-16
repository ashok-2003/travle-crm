// Trying a failed upload again (Ruling B): without choosing the file again, picking up where it stopped. On the same
// signed upload while it lasts and storage hasn't refused it, then only the confirmation once storage has the file; a
// new signed upload once it expired or storage refused it, or when the sensitivity shown has changed since, so the
// file is stored as the screen says.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Upload from "@/files/upload";
import { UploadError } from "@/files/upload";
import { messages } from "@/i18n/messages";
import { inputsSentTo } from "../business/sent";
import { stubApi, type Answer } from "../support/api-stub";
import { certificate, fileInput, pdf, record, renderPanel, requested, signed, subscription } from "./panel";

const uploadFile = vi.hoisted(() => vi.fn<typeof Upload.uploadFile>());
vi.mock("@/files/upload", async (importOriginal) => ({ ...(await importOriginal<typeof Upload>()), uploadFile }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const words = messages.business.attachments;
const tryAgain = words.tryAgainName.replace("{name}", "GST certificate.pdf");
const countOf = (calls: string[], path: string) => calls.filter((call) => call === path).length;

function renderUploading(answers: Record<string, Answer> = {}) {
  const api = stubApi({
    "attachments.list": { data: [] },
    "attachments.requestUpload": requested,
    "attachments.confirmUpload": { data: certificate },
    "subscription.get": subscription("full"),
    ...answers,
  });
  renderPanel();
  return api;
}

const uploaded = () =>
  waitFor(() => {
    expect(toast.success).toHaveBeenCalledWith(words.uploaded.replace("{name}", "GST certificate.pdf"));
  });

describe("trying an upload again", () => {
  beforeEach(() => {
    uploadFile.mockReset();
    toast.success.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a file that didn't reach storage again on the same signed upload, without choosing it again", async () => {
    uploadFile.mockRejectedValueOnce(new UploadError(0)).mockResolvedValueOnce();
    const api = renderUploading();
    await screen.findByText("No files yet.");
    const file = pdf();
    await userEvent.upload(fileInput(), file);
    expect(await screen.findByText(words.storageUnreachable)).toBeVisible();
    expect(api.calls).not.toContain("attachments.confirmUpload");

    await userEvent.click(screen.getByRole("button", { name: tryAgain }));
    await uploaded();
    expect(uploadFile.mock.calls.map(([sentTo, sent]) => [sentTo, sent])).toEqual([
      [signed, file],
      [signed, file],
    ]);
    expect(countOf(api.calls, "attachments.requestUpload")).toBe(1);
    expect(inputsSentTo("attachments.confirmUpload")).toEqual([{ ...record, attachmentId: certificate.id }]);
  });

  it("asks for a new signed upload when the first one expired", async () => {
    uploadFile.mockRejectedValueOnce(new UploadError(0)).mockResolvedValueOnce();
    const expired = { data: { ...requested.data, upload: { ...signed, expiresAt: "2026-01-01T00:00:00.000Z" } } };
    const api = renderUploading({ "attachments.requestUpload": expired });
    await screen.findByText("No files yet.");
    await userEvent.upload(fileInput(), pdf());
    await userEvent.click(await screen.findByRole("button", { name: tryAgain }));
    await uploaded();
    expect(countOf(api.calls, "attachments.requestUpload")).toBe(2);
  });

  it("asks for a new signed upload when storage refused the first, whatever the device's clock says", async () => {
    uploadFile.mockRejectedValueOnce(new UploadError(403)).mockResolvedValueOnce();
    const api = renderUploading();
    await screen.findByText("No files yet.");
    await userEvent.upload(fileInput(), pdf());
    expect(await screen.findByText(words.storageRefused)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: tryAgain }));
    await uploaded();
    expect(countOf(api.calls, "attachments.requestUpload")).toBe(2);
  });

  it("once storage has the file, only confirms it", async () => {
    uploadFile.mockResolvedValue();
    const api = renderUploading({ "attachments.confirmUpload": { status: 503 } });
    await screen.findByText("No files yet.");
    await userEvent.upload(fileInput(), pdf());
    expect(await screen.findByText(messages.errors.generic)).toBeVisible();

    api.answer("attachments.confirmUpload", { data: certificate });
    await userEvent.click(screen.getByRole("button", { name: tryAgain }));
    await uploaded();
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(countOf(api.calls, "attachments.requestUpload")).toBe(1);
    expect(inputsSentTo("attachments.confirmUpload")).toEqual([
      { ...record, attachmentId: certificate.id },
      { ...record, attachmentId: certificate.id },
    ]);
  });

  it("stores the file as sensitive or not as the screen shows when trying again, even if changed meanwhile", async () => {
    uploadFile.mockRejectedValueOnce(new UploadError(0)).mockResolvedValueOnce();
    const api = renderUploading();
    await screen.findByText("No files yet.");
    await userEvent.click(screen.getByRole("radio", { name: words.notSensitive }));
    await userEvent.upload(fileInput(), pdf());
    expect(await screen.findByText(words.storageUnreachable)).toBeVisible();

    // The risky way round: Sensitive is shown now, so it must not be stored as it was first asked for.
    await userEvent.click(screen.getByRole("radio", { name: words.sensitive }));
    await userEvent.click(screen.getByRole("button", { name: tryAgain }));
    await uploaded();
    expect(countOf(api.calls, "attachments.requestUpload")).toBe(2);
    expect(inputsSentTo("attachments.requestUpload")).toEqual([
      expect.objectContaining({ sensitive: false }),
      expect.objectContaining({ sensitive: true }),
    ]);
  });
});
