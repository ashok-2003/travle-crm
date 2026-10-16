// Adding a file to a record (spec 9.2): whether it is sensitive is asked first, sensitive unless chosen otherwise and
// for good; the file is checked before anything is sent, then goes straight to storage with its progress and is
// confirmed; the storage limit's refusal says so; and it can be stopped. Trying a failed upload again is in
// upload-retry.test.tsx.
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Upload from "@/files/upload";
import { messages } from "@/i18n/messages";
import { inputsSentTo } from "../business/sent";
import { stubApi } from "../support/api-stub";
import { certificate, fileInput, pdf, record, renderPanel, requested, signed, subscription } from "./panel";

const uploadFile = vi.hoisted(() => vi.fn<typeof Upload.uploadFile>());
vi.mock("@/files/upload", async (importOriginal) => ({ ...(await importOriginal<typeof Upload>()), uploadFile }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const words = messages.business.attachments;
const tryAgain = words.tryAgainName.replace("{name}", "GST certificate.pdf");
const sensitive = () => screen.getByRole("radio", { name: words.sensitive });

describe("UploadControl", () => {
  beforeEach(() => {
    uploadFile.mockReset();
    toast.success.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("checks a file's type and size before sending anything", async () => {
    const api = stubApi({ "attachments.list": { data: [] }, "subscription.get": subscription("full") });
    renderPanel();
    await screen.findByText("No files yet.");
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(fileInput(), new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }));
    expect(screen.getByText(words.problems.type.replace("{name}", "logo.svg"))).toBeVisible();
    const scan = new File(["x"], "scan.pdf", { type: "application/pdf" });
    Object.defineProperty(scan, "size", { value: 26 * 1024 * 1024 });
    await user.upload(fileInput(), scan);
    expect(screen.getByText(words.problems.size.replace("{name}", "scan.pdf"))).toBeVisible();
    expect(api.calls).not.toContain("attachments.requestUpload");
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("sends a file straight to storage with its progress, confirms it, and lists it", async () => {
    let progressed: (fraction: number) => void = () => undefined;
    let arrive: () => void = () => undefined;
    uploadFile.mockImplementation(
      (_upload, _file, options) =>
        new Promise<void>((resolve) => {
          progressed = options?.onProgress ?? progressed;
          arrive = resolve;
        }),
    );
    const api = stubApi({
      "attachments.list": { data: [] },
      "attachments.requestUpload": requested,
      "attachments.confirmUpload": { data: certificate },
      "subscription.get": subscription("full"),
    });
    renderPanel();
    await screen.findByText("No files yet.");
    const file = pdf();
    await userEvent.upload(fileInput(), file);
    await waitFor(() => {
      expect(uploadFile).toHaveBeenCalled();
    });
    const [sentUpload, sentFile, options] = uploadFile.mock.calls[0] ?? [];
    expect(sentUpload).toEqual(signed);
    expect(sentFile).toBe(file);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    act(() => {
      progressed(0.4);
    });
    expect(screen.getByText("40%")).toBeVisible();
    expect(screen.getByText(words.uploading.replace("{name}", "GST certificate.pdf"))).toBeVisible();
    api.answer("attachments.list", { data: [certificate] });
    act(() => {
      arrive();
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(words.uploaded.replace("{name}", "GST certificate.pdf"));
    });
    expect(inputsSentTo("attachments.requestUpload")).toEqual([
      { ...record, fileName: "GST certificate.pdf", contentType: "application/pdf", sizeBytes: 8, sensitive: true },
    ]);
    expect(inputsSentTo("attachments.confirmUpload")).toEqual([{ ...record, attachmentId: certificate.id }]);
    expect(await screen.findByRole("listitem")).toHaveTextContent("GST certificate.pdf");
  });

  it("asks whether the file is sensitive, sensitive unless chosen otherwise, and says it is for good", async () => {
    uploadFile.mockResolvedValue();
    stubApi({
      "attachments.list": { data: [] },
      "attachments.requestUpload": requested,
      "attachments.confirmUpload": { data: certificate },
      "subscription.get": subscription("full"),
    });
    renderPanel();
    await screen.findByText("No files yet.");
    expect(screen.getByRole("group", { name: words.sensitivity })).toHaveTextContent(words.sensitivityHint);
    expect(sensitive()).toBeChecked();
    expect(sensitive()).toHaveAccessibleDescription(words.sensitiveHint);
    await userEvent.click(screen.getByRole("radio", { name: words.notSensitive }));
    await userEvent.upload(fileInput(), pdf());
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
    expect(inputsSentTo("attachments.requestUpload")).toEqual([expect.objectContaining({ sensitive: false })]);
    // The next file starts sensitive again.
    await waitFor(() => {
      expect(sensitive()).toBeChecked();
    });
  });

  it("shows the storage limit's refusal, and sends nothing to storage", async () => {
    stubApi({
      "attachments.list": { data: [] },
      "attachments.requestUpload": { status: 403, reason: "STORAGE_LIMIT_REACHED" },
      "subscription.get": subscription("full"),
    });
    renderPanel();
    await screen.findByText("No files yet.");
    await userEvent.upload(fileInput(), pdf());
    expect(await screen.findByText(messages.errors.reasons.STORAGE_LIMIT_REACHED)).toBeVisible();
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("stops an upload when asked, without calling it a failure", async () => {
    uploadFile.mockImplementation(
      (_upload, _file, options) =>
        new Promise<void>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The upload was stopped", "AbortError"));
          });
        }),
    );
    stubApi({
      "attachments.list": { data: [] },
      "attachments.requestUpload": requested,
      "subscription.get": subscription("full"),
    });
    renderPanel();
    await screen.findByText("No files yet.");
    await userEvent.upload(fileInput(), pdf());
    await userEvent.click(await screen.findByRole("button", { name: words.stop }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: words.upload })).toBeEnabled();
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: tryAgain })).toBeNull();
  });
});
