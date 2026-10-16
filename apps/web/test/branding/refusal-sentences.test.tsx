// The api's refusals for the documents' branding (Ruling D) show their own sentences through the usual error path: a
// logo with more pixels than a document's header may hold, refused once storage has it.
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogoPanel } from "@/branding/logo-panel";
import type * as UploadModule from "@/files/upload";
import { uploadFile } from "@/files/upload";
import { messages } from "@/i18n/messages";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";
import { subscriptionAnswer } from "../documents/subscription";

vi.mock("@/files/upload", async (importOriginal) => ({
  ...(await importOriginal<typeof UploadModule>()),
  uploadFile: vi.fn(),
}));

// The sentences arrive with the api's reasons (errors.json); where one isn't there yet a stand-in takes its place, so
// this checks that a refusal's own sentence is shown, whatever its words.
vi.mock("@/i18n/messages/en-IN/errors.json", async (importOriginal) => {
  const errors = await importOriginal<{ default: { reasons: Record<string, string> } }>();
  const reasons = { LOGO_TOO_LARGE: "This image is too large for a logo.", ...errors.default.reasons };
  return { ...errors, default: { ...errors.default, reasons } };
});

const sentenceFor = (reason: string) => (messages.errors.reasons as Record<string, string>)[reason] ?? "";

const upload = {
  url: "https://files.example.test/organizations/o/attachments/a002?signature=2",
  method: "PUT" as const,
  headers: { "content-type": "image/png", "content-length": "9", "if-none-match": "*" },
  expiresAt: "2099-10-15T05:40:00.000Z",
};

beforeEach(() => {
  screenIs("wide");
  vi.mocked(uploadFile).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the branding's refusals", () => {
  it("shows the refusal of a logo with too many pixels as its sentence", async () => {
    vi.mocked(uploadFile).mockResolvedValue();
    stubApi({
      "organization.logo.get": { data: null },
      "organization.logo.requestUpload": {
        data: { attachmentId: "0199e7a0-0000-7000-8000-00000000a002", upload },
      },
      "organization.logo.confirmUpload": { status: 400, reason: "LOGO_TOO_LARGE" },
      "subscription.get": subscriptionAnswer(),
    });
    renderWithApi(<LogoPanel />, newQueryClient(null));
    await screen.findByText(messages.documents.branding.logo.none);
    const huge = new File([new Uint8Array(9)], "Banner.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(messages.documents.branding.logo.fileLabel), { target: { files: [huge] } });
    expect(await screen.findByText(sentenceFor("LOGO_TOO_LARGE"))).toBeVisible();
    expect(sentenceFor("LOGO_TOO_LARGE")).not.toBe("");
  });
});
