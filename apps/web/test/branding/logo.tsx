// What the logo's tests share: the current logo, a signed upload, a PNG, and the panel rendered against the api stub,
// with a file chosen as the browser's picker would.
import { fireEvent, screen } from "@testing-library/react";
import { LogoPanel } from "@/branding/logo-panel";
import { messages } from "@/i18n/messages";
import { newQueryClient, renderWithApi } from "../organization/api";
import { stubApi, type Answer } from "../support/api-stub";
import { subscriptionAnswer } from "../documents/subscription";

export const attachmentId = "0199e7a0-0000-7000-8000-00000000a001";

export const logo = {
  attachmentId,
  fileName: "Sharma.png",
  url: "https://files.example.test/organizations/o/attachments/a001?signature=1",
  expiresAt: "2026-10-15T05:35:00.000Z",
};

/** Signed until long after the tests run, so a retry may use it again. */
export const upload = {
  url: "https://files.example.test/organizations/o/attachments/a002?signature=2",
  method: "PUT" as const,
  headers: { "content-type": "image/png", "content-length": "9", "if-none-match": "*" },
  expiresAt: "2099-10-15T05:40:00.000Z",
};

export function renderPanel(answers: Record<string, Answer> = {}) {
  const api = stubApi({
    "organization.logo.get": { data: logo },
    "subscription.get": subscriptionAnswer(),
    ...answers,
  });
  renderWithApi(<LogoPanel />, newQueryClient(null));
  return api;
}

export const png = (name = "Sharma.png", size = 9) => new File([new Uint8Array(size)], name, { type: "image/png" });

/** Chooses a file as the browser's file picker would. */
export function choose(file: File) {
  fireEvent.change(screen.getByLabelText(messages.documents.branding.logo.fileLabel), { target: { files: [file] } });
}
