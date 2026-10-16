// What the files panel's tests share: the Owner's organization record, two of its files, a signed upload, the
// subscription's answer, and the panel rendered against the api stub.
import type { AttachmentSummary } from "@travel-crm/contracts/files";
import { AttachmentsPanel } from "@/files/attachments-panel";
import { newQueryClient, renderWithApi } from "../organization/api";
import { member } from "../support/members";

export const owner = member({ isOwner: true });
export const record = { recordType: "organization", recordId: owner.organization.id };

export const certificate: AttachmentSummary = {
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

export const cheque: AttachmentSummary = {
  ...certificate,
  id: "0199b000-0000-7000-8000-000000000002",
  fileName: "Cancelled cheque.jpg",
  contentType: "image/jpeg",
  sizeBytes: 880_640,
  sensitive: true,
};

/** An upload signed until long after the tests run, so a retry may use it again. */
export const signed = {
  url: "https://files.example/organizations/x/attachments/y",
  method: "PUT",
  headers: { "content-type": "application/pdf", "content-length": "8", "if-none-match": "*" },
  expiresAt: "2099-10-16T05:10:00.000Z",
};

export const requested = { data: { attachment: { ...certificate, status: "pending" }, upload: signed } };

export const subscription = (access: "full" | "read_only") => ({
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

export function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("the panel has no file input");
  return input;
}

export const pdf = () => new File(["%PDF-1.4"], "GST certificate.pdf", { type: "application/pdf" });

export const renderPanel = (me = owner) =>
  renderWithApi(<AttachmentsPanel record={record} emptyMessage="No files yet." />, newQueryClient(null), me);
