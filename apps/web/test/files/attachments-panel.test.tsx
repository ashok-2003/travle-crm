// A record's files (spec 9.2): listed with their kind, size and the day they were added; a sensitive file is only a
// "Sensitive file" to a role that may not open it; downloads go by a short-lived link; removing asks first and waits
// for the api's answer, showing a refusal; a read-only organization may download, not change, and so may a suspended
// one's Owner. Adding a file is in upload-control.test.tsx.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { loadPage } from "@/lib/navigate";
import { inputsSentTo } from "../business/sent";
import { heldAnswer, stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { certificate, cheque, record, renderPanel, signed, subscription } from "./panel";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const words = messages.business.attachments;

describe("AttachmentsPanel", () => {
  beforeEach(() => {
    vi.mocked(loadPage).mockReset();
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
    // Only the figure is mono, not its unit.
    expect(within(first ?? document.body).getByText("1.2")).toHaveClass("numbers");
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
      expect(loadPage).toHaveBeenCalledWith("https://files.example/gst.pdf");
    });
    expect(inputsSentTo("attachments.downloadLink")).toEqual([{ ...record, attachmentId: certificate.id }]);
  });

  it("removes a file once asked again, the dialog waiting for the api's answer", async () => {
    const removal = heldAnswer({ data: null });
    const api = stubApi({
      "attachments.list": { data: [certificate] },
      "attachments.remove": removal.answer,
      "subscription.get": subscription("full"),
    });
    renderPanel();
    const remove = await screen.findByRole("button", { name: "Remove GST certificate.pdf" });
    // Red is for the final step only: the row's button is an outline one.
    expect(remove).toHaveAttribute("data-variant", "outline");
    await userEvent.click(remove);
    const dialog = screen.getByRole("alertdialog", {
      name: words.removeTitle.replace("{name}", "GST certificate.pdf"),
    });
    const confirm = within(dialog).getByRole("button", { name: words.remove });
    expect(confirm).toHaveAttribute("data-variant", "destructive");
    api.answer("attachments.list", { data: [] });
    await userEvent.click(confirm);
    // While the api answers, nothing closes the dialog.
    expect(within(dialog).getByRole("button", { name: messages.common.cancel })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(dialog).toBeVisible();

    removal.release();
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(words.removed.replace("{name}", "GST certificate.pdf"));
    });
    expect(inputsSentTo("attachments.remove")).toEqual([{ ...record, attachmentId: certificate.id }]);
    expect(await screen.findByText("No files yet.")).toBeVisible();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("shows a refusal to remove in the dialog that asked", async () => {
    stubApi({
      "attachments.list": { data: [certificate] },
      "attachments.remove": { status: 403, reason: "MISSING_PERMISSION" },
      "subscription.get": subscription("full"),
    });
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Remove GST certificate.pdf" }));
    const dialog = screen.getByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: words.remove }));
    expect(await within(dialog).findByText(messages.errors.reasons.MISSING_PERMISSION)).toBeVisible();
  });

  it("lets a read-only organization download its files, but not upload or remove them, and says why", async () => {
    stubApi({ "attachments.list": { data: [certificate] }, "subscription.get": subscription("read_only") });
    renderPanel();
    expect(await screen.findByText(messages.errors.reasons.ORGANIZATION_READ_ONLY)).toBeVisible();
    expect(screen.getByRole("button", { name: words.upload })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove GST certificate.pdf" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download GST certificate.pdf" })).toBeEnabled();
  });

  it("lets a suspended organization's Owner take its papers away, but not change them", async () => {
    stubApi({ "attachments.list": { data: [certificate] }, "subscription.get": subscription("export_only") });
    renderPanel();
    expect(await screen.findByRole("button", { name: "Download GST certificate.pdf" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Remove GST certificate.pdf" })).toBeDisabled();
    expect(screen.getByRole("button", { name: words.upload })).toBeDisabled();
    expect(screen.getByText(messages.errors.reasons.ORGANIZATION_SUSPENDED)).toBeVisible();
  });

  it("says a refusal's own sentence rather than that the files didn't load", async () => {
    stubApi({
      "attachments.list": { status: 403, reason: "ORGANIZATION_SUSPENDED" },
      "subscription.get": subscription("full"),
    });
    renderPanel();
    expect(await screen.findByText(messages.errors.reasons.ORGANIZATION_SUSPENDED)).toBeVisible();
    expect(screen.queryByText(words.loadFailed)).toBeNull();
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
