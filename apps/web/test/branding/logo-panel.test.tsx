// The logo on the branding screen (spec 9.2, 9.3): shown through its short-lived link, uploaded straight to storage
// with progress once its type and size have been checked here, confirmed, and removed after asking. A failed upload
// or a refusal shows its sentence; in a read-only organization uploading is disabled with the reason.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogoPanel } from "@/branding/logo-panel";
import type * as UploadModule from "@/files/upload";
import { UploadError, uploadFile } from "@/files/upload";
import { messages } from "@/i18n/messages";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi, type Answer } from "../support/api-stub";
import { inputsSentTo } from "../documents/sent";
import { subscriptionAnswer } from "../documents/subscription";

vi.mock("@/files/upload", async (importOriginal) => ({
  ...(await importOriginal<typeof UploadModule>()),
  uploadFile: vi.fn(),
}));

const words = messages.documents.branding.logo;

const attachmentId = "0199e7a0-0000-7000-8000-00000000a001";
const logo = {
  attachmentId,
  fileName: "Sharma.png",
  url: "https://files.example.test/organizations/o/attachments/a001?signature=1",
  expiresAt: "2026-10-15T05:35:00.000Z",
};
const upload = {
  url: "https://files.example.test/organizations/o/attachments/a002?signature=2",
  method: "PUT" as const,
  headers: { "content-type": "image/png", "content-length": "9", "if-none-match": "*" },
  expiresAt: "2026-10-15T05:40:00.000Z",
};

function renderPanel(answers: Record<string, Answer> = {}) {
  const api = stubApi({
    "organization.logo.get": { data: logo },
    "subscription.get": subscriptionAnswer(),
    ...answers,
  });
  renderWithApi(<LogoPanel />, newQueryClient(null));
  return api;
}

const png = (name = "Sharma.png", size = 9) => new File([new Uint8Array(size)], name, { type: "image/png" });

/** Chooses a file as the browser's file picker would. */
function choose(file: File) {
  fireEvent.change(screen.getByLabelText(words.fileLabel), { target: { files: [file] } });
}

beforeEach(() => {
  screenIs("wide");
  vi.mocked(uploadFile).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LogoPanel", () => {
  it("shows the logo through its short-lived link", async () => {
    renderPanel();
    expect(await screen.findByRole("img", { name: words.alt })).toHaveAttribute("src", logo.url);
    expect(screen.getByRole("button", { name: words.replace })).toBeEnabled();
  });

  it("says there is no logo yet", async () => {
    renderPanel({ "organization.logo.get": { data: null } });
    expect(await screen.findByText(words.none)).toBeVisible();
    expect(screen.getByRole("button", { name: words.upload })).toBeEnabled();
    expect(screen.queryByRole("button", { name: words.remove })).toBeNull();
  });

  it("checks the type and size before sending anything", async () => {
    const api = renderPanel({ "organization.logo.get": { data: null } });
    await screen.findByText(words.none);
    choose(new File(["<svg/>"], "Logo.svg", { type: "image/svg+xml" }));
    expect(await screen.findByText(words.wrongType)).toBeVisible();
    choose(png("Big.png", 1024 * 1024 + 1));
    expect(await screen.findByText(words.tooLarge.replace("{size}", "1 MB"))).toBeVisible();
    expect(api.calls).not.toContain("organization.logo.requestUpload");
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("uploads straight to storage with progress, confirms, and shows the new logo", async () => {
    let finish: () => void = () => undefined;
    vi.mocked(uploadFile).mockImplementation((_upload, _file, options) => {
      options?.onProgress?.(0.5);
      return new Promise((resolve) => {
        finish = () => {
          resolve();
        };
      });
    });
    const replaced = { ...logo, attachmentId: "0199e7a0-0000-7000-8000-00000000a002", url: `${logo.url}&new` };
    const api = renderPanel({
      "organization.logo.get": { data: null },
      "organization.logo.requestUpload": { data: { attachmentId: replaced.attachmentId, upload } },
      "organization.logo.confirmUpload": { data: replaced },
    });
    await screen.findByText(words.none);
    const file = png();
    choose(file);

    await waitFor(() => {
      expect(vi.mocked(uploadFile).mock.calls.map(([sentTo, sent]) => [sentTo, sent])).toEqual([[upload, file]]);
    });
    expect(inputsSentTo("organization.logo.requestUpload")).toEqual([
      { fileName: "Sharma.png", contentType: "image/png", sizeBytes: 9 },
    ]);
    expect(screen.getByRole("progressbar", { name: words.uploading })).toBeVisible();
    expect(api.calls).not.toContain("organization.logo.confirmUpload");
    finish();

    expect(await screen.findByRole("img", { name: words.alt })).toHaveAttribute("src", replaced.url);
    expect(inputsSentTo("organization.logo.confirmUpload")).toEqual([{ attachmentId: replaced.attachmentId }]);
  });

  it("gives a file whose name can't be stored a plain one", async () => {
    vi.mocked(uploadFile).mockResolvedValue();
    renderPanel({
      "organization.logo.get": { data: null },
      "organization.logo.requestUpload": { data: { attachmentId, upload } },
      "organization.logo.confirmUpload": { data: logo },
    });
    await screen.findByText(words.none);
    // A right-to-left override would show "Logo<RLO>gnp.exe" as "Logoexe.png".
    choose(new File([new Uint8Array(9)], "Logo\u202Egnp.exe.jpg", { type: "image/jpeg" }));
    await waitFor(() => {
      expect(inputsSentTo("organization.logo.requestUpload")).toEqual([
        { fileName: "Logo.jpg", contentType: "image/jpeg", sizeBytes: 9 },
      ]);
    });
  });

  it("says when the file didn't reach storage, and confirms nothing", async () => {
    vi.mocked(uploadFile).mockRejectedValue(new UploadError(0));
    const api = renderPanel({
      "organization.logo.get": { data: null },
      "organization.logo.requestUpload": { data: { attachmentId, upload } },
    });
    await screen.findByText(words.none);
    choose(png());
    expect(await screen.findByText(words.uploadFailed)).toBeVisible();
    expect(api.calls).not.toContain("organization.logo.confirmUpload");
  });

  it("shows a refusal as its sentence", async () => {
    renderPanel({
      "organization.logo.get": { data: null },
      "organization.logo.requestUpload": { status: 413, reason: "STORAGE_LIMIT_REACHED" },
    });
    await screen.findByText(words.none);
    choose(png());
    expect(await screen.findByText(messages.errors.reasons.STORAGE_LIMIT_REACHED)).toBeVisible();
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("removes the logo once asked again", async () => {
    const user = userEvent.setup();
    const api = renderPanel({ "organization.logo.remove": { data: null } });
    await user.click(await screen.findByRole("button", { name: words.remove }));
    expect(screen.getByText(words.removeDescription)).toBeVisible();
    api.answer("organization.logo.get", { data: null });
    await user.click(screen.getByRole("button", { name: words.removeConfirm }));
    await waitFor(() => {
      expect(inputsSentTo("organization.logo.remove")).toEqual([{ attachmentId }]);
    });
    expect(await screen.findByText(words.none)).toBeVisible();
  });

  it("says when a logo can't be shown", async () => {
    renderPanel();
    fireEvent.error(await screen.findByRole("img", { name: words.alt }));
    expect(await screen.findByText(words.broken)).toBeVisible();
  });

  it("disables uploading and removing in a read-only organization, saying why", async () => {
    renderPanel({
      "subscription.get": subscriptionAnswer("read_only"),
    });
    expect(await screen.findByText(messages.errors.reasons.ORGANIZATION_READ_ONLY)).toBeVisible();
    expect(screen.getByRole("button", { name: words.replace })).toBeDisabled();
    expect(screen.getByRole("button", { name: words.remove })).toBeDisabled();
  });
});
