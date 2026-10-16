// A record's files (spec 9.2): listed with their kind, size and the day they were added; a file is checked before
// anything is sent, then goes straight to storage with its progress and is confirmed; the storage limit's refusal and
// a storage that can't be reached say so; a sensitive file is only a "Sensitive file" to a role that may not open it;
// downloads go by a short-lived link; removing asks first; a read-only organization may download, not change.
import type { AttachmentSummary } from "@travel-crm/contracts/files";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentsPanel } from "@/files/attachments-panel";
import type * as Upload from "@/files/upload";
import { UploadError } from "@/files/upload";
import { messages } from "@/i18n/messages";
import { inputsSentTo } from "../business/sent";
import { newQueryClient, renderWithApi } from "../organization/api";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";

const uploadFile = vi.hoisted(() => vi.fn<typeof Upload.uploadFile>());
vi.mock("@/files/upload", async (importOriginal) => ({ ...(await importOriginal<typeof Upload>()), uploadFile }));
const startDownload = vi.hoisted(() => vi.fn<(url: string) => void>());
vi.mock("@/files/start-download", () => ({ startDownload }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const words = messages.business.attachments;

const owner = member({ isOwner: true });
const record = { recordType: "organization", recordId: owner.organization.id };

const certificate: AttachmentSummary = {
  id: "0199b000-0000-7000-8000-000000000001",
  ...record,
  fileName: "GST certificate.pdf",
  contentType: "application/pdf",
  sizeBytes: 1_258_291,
  sensitive: false,
  status: "ready",
  // 18:45 UTC on 15 October is already 16 October in India.
  createdAt: "2026-10-15T18:45:00.000Z",
};
const cheque: AttachmentSummary = {
  ...certificate,
  id: "0199b000-0000-7000-8000-000000000002",
  fileName: "Cancelled cheque.jpg",
  contentType: "image/jpeg",
  sizeBytes: 880_640,
  sensitive: true,
};
const signed = {
  url: "https://files.example/organizations/x/attachments/y",
  method: "PUT",
  headers: { "content-type": "application/pdf", "content-length": "8", "if-none-match": "*" },
  expiresAt: "2026-10-16T05:10:00.000Z",
};

const subscription = (access: "full" | "read_only") => ({
  data: {
    status: access === "full" ? "active" : "read_only",
    access,
    planName: "Growth",
    modules: [],
    trialEndsOn: null,
    paidThrough: null,
    nextChangeOn: null,
    limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1000 },
  },
});

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("the panel has no file input");
  return input;
}

const pdf = () => new File(["%PDF-1.4"], "GST certificate.pdf", { type: "application/pdf" });

const renderPanel = (me = owner) =>
  renderWithApi(<AttachmentsPanel record={record} emptyMessage="No files yet." />, newQueryClient(null), me);

describe("AttachmentsPanel", () => {
  beforeEach(() => {
    uploadFile.mockReset();
    startDownload.mockReset();
    toast.success.mockClear();
    toast.error.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the record's files with their kind, size and day added, and marks the sensitive ones", async () => {
    stubApi({ "attachments.list": { data: [certificate, cheque] }, "subscription.get": subscription("full") });
    renderPanel();
    const [first, second] = await screen.findAllByRole("listitem");
    expect(first).toHaveTextContent("GST certificate.pdf");
    expect(first).toHaveTextContent(/PDF · 1\.2 MB · Added 16 Oct/);
    expect(within(first ?? document.body).getByText("1.2 MB")).toHaveClass("numbers");
    expect(second).toHaveTextContent("Cancelled cheque.jpg");
    expect(second).toHaveTextContent(/JPEG image · 860 KB · Added 16 Oct · Sensitive/);
    expect(
      within(second ?? document.body).getByRole("button", { name: "Download Cancelled cheque.jpg" }),
    ).toBeVisible();
  });

  it("says what belongs here when there is nothing yet", async () => {
    stubApi({ "attachments.list": { data: [] }, "subscription.get": subscription("full") });
    renderPanel();
    expect(await screen.findByText("No files yet.")).toBeVisible();
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
      "attachments.requestUpload": { data: { attachment: { ...certificate, status: "pending" }, upload: signed } },
      "attachments.confirmUpload": { data: certificate },
      "subscription.get": subscription("full"),
    });
    renderPanel();
    await screen.findByText("No files yet.");
    await userEvent.click(screen.getByRole("checkbox", { name: words.sensitive }));
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

  it("says when the file didn't reach storage, and confirms nothing", async () => {
    uploadFile.mockRejectedValue(new UploadError(0));
    const api = stubApi({
      "attachments.list": { data: [] },
      "attachments.requestUpload": { data: { attachment: { ...certificate, status: "pending" }, upload: signed } },
      "subscription.get": subscription("full"),
    });
    renderPanel();
    await screen.findByText("No files yet.");
    await userEvent.upload(fileInput(), pdf());
    expect(await screen.findByText(words.storageUnreachable)).toBeVisible();
    expect(api.calls).not.toContain("attachments.confirmUpload");
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
      "attachments.requestUpload": { data: { attachment: { ...certificate, status: "pending" }, upload: signed } },
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
  });

  it("shows a sensitive file only as such to a role that may not open it, with nothing to do to it", async () => {
    stubApi({
      "attachments.list": { data: [{ ...cheque, fileName: "Sensitive file" }] },
      "subscription.get": subscription("full"),
    });
    renderPanel(member({ permissions: ["settings:manage"] }));
    const row = await screen.findByRole("listitem");
    expect(row).toHaveTextContent(words.sensitiveFile);
    expect(row).toHaveTextContent(words.sensitiveHidden);
    expect(within(row).queryByRole("button")).toBeNull();
  });

  it("downloads a file by a short-lived link", async () => {
    stubApi({
      "attachments.list": { data: [certificate] },
      "attachments.downloadLink": { data: { url: "https://files.example/gst.pdf", expiresAt: signed.expiresAt } },
      "subscription.get": subscription("full"),
    });
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Download GST certificate.pdf" }));
    await waitFor(() => {
      expect(startDownload).toHaveBeenCalledWith("https://files.example/gst.pdf");
    });
    expect(inputsSentTo("attachments.downloadLink")).toEqual([{ ...record, attachmentId: certificate.id }]);
  });

  it("removes a file once asked again", async () => {
    const api = stubApi({
      "attachments.list": { data: [certificate] },
      "attachments.remove": { data: null },
      "subscription.get": subscription("full"),
    });
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Remove GST certificate.pdf" }));
    const dialog = screen.getByRole("alertdialog", {
      name: words.removeTitle.replace("{name}", "GST certificate.pdf"),
    });
    api.answer("attachments.list", { data: [] });
    await userEvent.click(within(dialog).getByRole("button", { name: words.remove }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(words.removed.replace("{name}", "GST certificate.pdf"));
    });
    expect(inputsSentTo("attachments.remove")).toEqual([{ ...record, attachmentId: certificate.id }]);
    expect(await screen.findByText("No files yet.")).toBeVisible();
  });

  it("lets a read-only organization download its files, but not upload or remove them, and says why", async () => {
    stubApi({ "attachments.list": { data: [certificate] }, "subscription.get": subscription("read_only") });
    renderPanel();
    expect(await screen.findByText(messages.errors.reasons.ORGANIZATION_READ_ONLY)).toBeVisible();
    expect(screen.getByRole("button", { name: words.upload })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove GST certificate.pdf" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download GST certificate.pdf" })).toBeEnabled();
  });

  it("says so when the files didn't load, and tries again", async () => {
    const api = stubApi({ "attachments.list": { status: 500 }, "subscription.get": subscription("full") });
    renderPanel();
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    api.answer("attachments.list", { data: [certificate] });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByRole("listitem")).toHaveTextContent("GST certificate.pdf");
  });
});
