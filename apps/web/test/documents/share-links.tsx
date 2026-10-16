// What the share links' tests share: a document with its PDF, its links (working, turned off, expired), a new link's
// token, and the dialog rendered as the documents screen opens it, with a way to open it again once closed.
import { screen } from "@testing-library/react";
import { useState } from "react";
import { ShareLinksDialog } from "@/documents/share-links-dialog";
import { newQueryClient, renderWithApi } from "../organization/api";
import { stubApi, type Answer } from "../support/api-stub";
import { subscriptionAnswer } from "./subscription";

export const document = {
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
export const forMeera = link("For Meera Iyer", {
  openCount: 2,
  lastOpenedAt: "2026-10-15T18:45:00.000Z",
  expiresAt: null,
});
export const turnedOff = link("Old link", { revokedAt: "2026-10-15T07:00:00.000Z" });
export const expired = link("Last year's", { expiresAt: "2025-10-15T06:00:00.000Z" });
export const token = `${"A".repeat(22)}${"b".repeat(43)}`;
export const created = { data: { shareLinkId: forMeera.id, token, path: `/p/${token}` } };

/** The label of the button that opens the dialog again once it is closed. */
export const SHARE_AGAIN = "Share again";

/** The dialog, open, as the documents screen holds it: closing it closes it, and it can be opened again. */
function Sharing() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        {SHARE_AGAIN}
      </button>
      <ShareLinksDialog document={document} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function renderDialog(answers: Record<string, Answer> = {}) {
  const api = stubApi({
    "subscription.get": subscriptionAnswer(),
    "shareLinks.list": { data: [forMeera, turnedOff, expired] },
    "shareLinks.create": created,
    "shareLinks.revoke": { data: null },
    ...answers,
  });
  renderWithApi(<Sharing />, newQueryClient(null));
  return api;
}

export const rowOf = (label: string) => {
  const row = screen.getByText(label).closest<HTMLElement>("[role=listitem]");
  if (!row) throw new Error(`no row for ${label}`);
  return row;
};
