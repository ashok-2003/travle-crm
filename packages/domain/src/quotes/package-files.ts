// A package's brochures (group packages): files the browser sends straight to storage. The AI agent sends a brochure (and
// the package's photos) to a customer who asks for details. Up to five. Staff who may edit packages manage them.
// Non-sensitive by construction.
import {
  MAX_PACKAGE_BROCHURE_BYTES,
  PACKAGE_BROCHURE_RECORD_TYPE,
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
import { readyAttachmentsIn, readyAttachmentsOfRecordsIn, type Files } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { filesWithLinks, requirePackage } from "./package-file-links.js";
import { brochuresByPackage } from "./package-brochures.js";

export interface PackageFileDependencies {
  db: Pick<Database, "forOrg">;
  files: Files;
}

const recordOf = (packageId: string) => ({ recordType: PACKAGE_BROCHURE_RECORD_TYPE, recordId: packageId });

/**
 * A package's brochures and photos inside a transaction already open, for the AI's turn: ids, never links, in the
 * order they arrived.
 */
export async function packageFilesIn(
  tx: OrgTx,
  packageId: string,
): Promise<{
  brochures: { id: string; fileName: string }[];
  photos: { id: string; fileName: string }[];
}> {
  const [brochures, photos] = await Promise.all([
    readyAttachmentsIn(tx, recordOf(packageId)),
    readyAttachmentsIn(tx, { recordType: PACKAGE_PHOTO_RECORD_TYPE, recordId: packageId }),
  ]);
  return {
    brochures: brochures.map(({ id, fileName }) => ({ id, fileName })),
    photos: photos.map(({ id, fileName }) => ({ id, fileName })),
  };
}

/** The same for many packages, by package id: the file ids, one read per kind whatever the number of packages. */
export async function packageFilesByPackage(
  tx: OrgTx,
  packageIds: readonly string[],
): Promise<Map<string, { brochures: string[]; photos: string[] }>> {
  const [brochures, photos] = await Promise.all([
    readyAttachmentsOfRecordsIn(tx, PACKAGE_BROCHURE_RECORD_TYPE, packageIds),
    readyAttachmentsOfRecordsIn(tx, PACKAGE_PHOTO_RECORD_TYPE, packageIds),
  ]);
  const ids = (files: Map<string, { id: string }[]>, packageId: string) =>
    (files.get(packageId) ?? []).map((file) => file.id);
  return new Map(packageIds.map((id) => [id, { brochures: ids(brochures, id), photos: ids(photos, id) }]));
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
  const words = await dependencies.db.forOrg(access.organizationId, (tx) => brochuresByPackage(tx, [packageId]));
  const wordsOf = new Map((words.get(packageId) ?? []).map((one) => [one.attachmentId, one]));
  return packageFiles.parse({
    brochures: brochures.map((file) => ({
      ...withAttachmentId(file),
      name: wordsOf.get(file.id)?.name ?? null,
      description: wordsOf.get(file.id)?.description ?? null,
    })),
  });
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
  // The words go with the file: nothing reads them without it, and they hold no history worth keeping.
  await dependencies.db.forOrg(access.organizationId, (tx) =>
    tx.packageBrochure.deleteMany({ where: { packageId: input.packageId, attachmentId: input.attachmentId } }),
  );
}
