// A package's brochures (group packages): files the browser sends straight to storage. The AI agent sends a brochure (and
// the package's photos) to a customer who asks for details. Up to five. Staff who may edit packages manage them.
// Non-sensitive by construction.
import {
  MAX_PACKAGE_BROCHURE_BYTES,
  PACKAGE_BROCHURE_RECORD_TYPE,
  PACKAGE_PAYMENT_QR_RECORD_TYPE,
  PACKAGE_PHOTO_RECORD_TYPE,
  type packageBrochureContentTypes,
} from "@travel-crm/contracts/files";
import {
  MAX_PACKAGE_BROCHURES,
  packageFiles,
  type PackageFile,
  type PackageFileKind,
} from "@travel-crm/contracts/quotes";
import type { Database, OrgTx } from "@travel-crm/db";
import { readyAttachmentsIn, type Files } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { filesWithLinks, requirePackage } from "./package-file-links.js";

export interface PackageFileDependencies {
  db: Pick<Database, "forOrg">;
  files: Files;
}

const recordOf = (packageId: string) => ({ recordType: PACKAGE_BROCHURE_RECORD_TYPE, recordId: packageId });

/**
 * A package's brochures and photos inside a transaction already open, for the AI's turn: ids, never links, in the
 * order they arrived. `paymentQrId` is the package's own old QR, still read by the earlier grounded agent only; it
 * goes with that agent (the stored QRs stay until the contract release).
 */
export async function packageFilesIn(
  tx: OrgTx,
  packageId: string,
): Promise<{
  brochures: { id: string; fileName: string }[];
  photos: { id: string; fileName: string }[];
  paymentQrId: string | null;
}> {
  const [brochures, photos, qrs] = await Promise.all([
    readyAttachmentsIn(tx, recordOf(packageId)),
    readyAttachmentsIn(tx, { recordType: PACKAGE_PHOTO_RECORD_TYPE, recordId: packageId }),
    readyAttachmentsIn(tx, { recordType: PACKAGE_PAYMENT_QR_RECORD_TYPE, recordId: packageId }),
  ]);
  // The newest QR wins, as in listPackageFiles.
  return {
    brochures: brochures.map(({ id, fileName }) => ({ id, fileName })),
    photos: photos.map(({ id, fileName }) => ({ id, fileName })),
    paymentQrId: qrs[qrs.length - 1]?.id ?? null,
  };
}

const withAttachmentId = (
  file: { id: string; fileName: string; contentType: string; url: string | null } | undefined,
) =>
  file === undefined
    ? null
    : { attachmentId: file.id, fileName: file.fileName, contentType: file.contentType, url: file.url };

/** The package's brochures in the order they arrived, each with a short-lived link. */
export async function listPackageFiles(
  dependencies: PackageFileDependencies,
  access: MemberAccess,
  packageId: string,
): Promise<{ brochures: PackageFile[] }> {
  await requirePackage(dependencies, access, packageId);
  const brochures = await filesWithLinks(dependencies.files, access, recordOf(packageId));
  return packageFiles.parse({ brochures: brochures.map(withAttachmentId) });
}

/** Pending uploads don't count, so this runs again at confirmation, when a file really joins the five. */
async function requireRoomForBrochure(
  dependencies: PackageFileDependencies,
  access: MemberAccess,
  packageId: string,
  confirming?: string,
) {
  const held = await dependencies.files.list(access, recordOf(packageId));
  // Confirming a file that is already one of the five again is harmless (confirmation is idempotent).
  if (held.length >= MAX_PACKAGE_BROCHURES && !held.some((file) => file.id === confirming)) {
    throw new DomainError("LIMIT_REACHED", "PACKAGE_BROCHURE_LIMIT", "A package holds five brochures at most");
  }
}

/** Step one of adding a file: within its size, its types and the five, and a place to put it. */
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
  if (input.sizeBytes > MAX_PACKAGE_BROCHURE_BYTES) {
    throw new DomainError("VALIDATION", "ATTACHMENT_TOO_BIG", "This file is over the size a package file can be");
  }
  await requireRoomForBrochure(dependencies, access, input.packageId);
  const { attachment, upload } = await dependencies.files.requestUpload(access, {
    ...recordOf(input.packageId),
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    sensitive: false,
  });
  return { attachmentId: attachment.id, upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
}

/** Marks the upload ready, within the five brochures. */
export async function confirmPackageFile(
  dependencies: PackageFileDependencies,
  access: MemberAccess,
  input: { packageId: string; kind: PackageFileKind; attachmentId: string },
): Promise<void> {
  await requirePackage(dependencies, access, input.packageId);
  await requireRoomForBrochure(dependencies, access, input.packageId, input.attachmentId);
  await dependencies.files.confirmUpload(access, {
    ...recordOf(input.packageId),
    attachmentId: input.attachmentId,
  });
}

export async function removePackageFile(
  dependencies: PackageFileDependencies,
  access: MemberAccess,
  input: { packageId: string; kind: PackageFileKind; attachmentId: string },
): Promise<void> {
  await requirePackage(dependencies, access, input.packageId);
  await dependencies.files.remove(access, {
    ...recordOf(input.packageId),
    attachmentId: input.attachmentId,
  });
}
