// A package's brochures and payment QR (group packages): files the browser sends straight to storage. The AI agent sends a
// brochure to a customer who asks for details and the QR to one who wants to book. Up to five brochures; one QR, which a new
// confirmed one replaces. Staff who may edit packages manage them. Non-sensitive by construction.
import {
  MAX_PACKAGE_BROCHURE_BYTES,
  MAX_PACKAGE_PAYMENT_QR_BYTES,
  PACKAGE_BROCHURE_RECORD_TYPE,
  PACKAGE_PAYMENT_QR_RECORD_TYPE,
  type packageBrochureContentTypes,
} from "@travel-crm/contracts/files";
import {
  MAX_PACKAGE_BROCHURES,
  packageFiles,
  type PackageFile,
  type PackageFileKind,
} from "@travel-crm/contracts/quotes";
import type { Database } from "@travel-crm/db";
import type { Files } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { filesWithLinks, requirePackage } from "./package-file-links.js";

export interface PackageFileDependencies {
  db: Pick<Database, "forOrg">;
  files: Files;
}

const recordOf = (packageId: string, kind: PackageFileKind) => ({
  recordType: kind === "brochure" ? PACKAGE_BROCHURE_RECORD_TYPE : PACKAGE_PAYMENT_QR_RECORD_TYPE,
  recordId: packageId,
});

const withAttachmentId = (
  file: { id: string; fileName: string; contentType: string; url: string | null } | undefined,
) =>
  file === undefined
    ? null
    : { attachmentId: file.id, fileName: file.fileName, contentType: file.contentType, url: file.url };

/** The package's brochures in the order they arrived and its payment QR, each with a short-lived link. */
export async function listPackageFiles(
  dependencies: PackageFileDependencies,
  access: MemberAccess,
  packageId: string,
): Promise<{ brochures: PackageFile[]; paymentQr: PackageFile | null }> {
  await requirePackage(dependencies, access, packageId);
  const [brochures, qrs] = await Promise.all([
    filesWithLinks(dependencies.files, access, recordOf(packageId, "brochure")),
    filesWithLinks(dependencies.files, access, recordOf(packageId, "payment_qr")),
  ]);
  // Files list oldest-confirmed first (listAttachments), so the last QR is the newest: if a failed removal left two, show it.
  return packageFiles.parse({
    brochures: brochures.map(withAttachmentId),
    paymentQr: qrs.length === 0 ? null : withAttachmentId(qrs[qrs.length - 1]),
  });
}

/** Pending uploads don't count, so this runs again at confirmation, when a file really joins the five. */
async function requireRoomForBrochure(
  dependencies: PackageFileDependencies,
  access: MemberAccess,
  packageId: string,
  confirming?: string,
) {
  const held = await dependencies.files.list(access, recordOf(packageId, "brochure"));
  // Confirming a file that is already one of the five again is harmless (confirmation is idempotent).
  if (held.length >= MAX_PACKAGE_BROCHURES && !held.some((file) => file.id === confirming)) {
    throw new DomainError("LIMIT_REACHED", "PACKAGE_BROCHURE_LIMIT", "A package holds five brochures at most");
  }
}

/** Step one of adding a file: within its size, its types and (for brochures) the five, and a place to put it. */
export async function requestPackageFileUpload(
  dependencies: PackageFileDependencies,
  access: MemberAccess,
  input: {
    packageId: string;
    kind: PackageFileKind;
    fileName: string;
    contentType: (typeof packageBrochureContentTypes)[number];
    sizeBytes: number;
  },
) {
  await requirePackage(dependencies, access, input.packageId);
  const limit = input.kind === "brochure" ? MAX_PACKAGE_BROCHURE_BYTES : MAX_PACKAGE_PAYMENT_QR_BYTES;
  if (input.sizeBytes > limit) {
    throw new DomainError("VALIDATION", "ATTACHMENT_TOO_BIG", "This file is over the size a package file can be");
  }
  if (input.kind === "brochure") await requireRoomForBrochure(dependencies, access, input.packageId);
  const { attachment, upload } = await dependencies.files.requestUpload(access, {
    ...recordOf(input.packageId, input.kind),
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    sensitive: false,
  });
  return { attachmentId: attachment.id, upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
}

/** Marks the upload ready; a confirmed payment QR replaces the one before it, whose file goes too. */
export async function confirmPackageFile(
  dependencies: PackageFileDependencies,
  access: MemberAccess,
  input: { packageId: string; kind: PackageFileKind; attachmentId: string },
): Promise<void> {
  await requirePackage(dependencies, access, input.packageId);
  const record = recordOf(input.packageId, input.kind);
  if (input.kind === "brochure")
    await requireRoomForBrochure(dependencies, access, input.packageId, input.attachmentId);
  await dependencies.files.confirmUpload(access, { ...record, attachmentId: input.attachmentId });
  if (input.kind !== "payment_qr") return;
  for (const old of await dependencies.files.list(access, record)) {
    if (old.id !== input.attachmentId) await dependencies.files.remove(access, { ...record, attachmentId: old.id });
  }
}

export async function removePackageFile(
  dependencies: PackageFileDependencies,
  access: MemberAccess,
  input: { packageId: string; kind: PackageFileKind; attachmentId: string },
): Promise<void> {
  await requirePackage(dependencies, access, input.packageId);
  await dependencies.files.remove(access, {
    ...recordOf(input.packageId, input.kind),
    attachmentId: input.attachmentId,
  });
}
