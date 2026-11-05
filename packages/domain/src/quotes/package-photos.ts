// A package's photos (release 7b): up to six pictures the browser sends straight to storage, shown on its public page. Staff who
// may edit packages add and remove them; the first is the page's picture in a link preview. Non-sensitive by construction.
import {
  MAX_PACKAGE_PHOTO_BYTES,
  PACKAGE_PHOTO_RECORD_TYPE,
  type packagePhotoContentTypes,
} from "@travel-crm/contracts/files";
import { MAX_PACKAGE_PHOTOS, packagePhotoList, type PackagePhoto } from "@travel-crm/contracts/quotes";
import type { Database } from "@travel-crm/db";
import type { Files } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { filesWithLinks, requirePackage } from "./package-file-links.js";

export interface PackagePhotoDependencies {
  db: Pick<Database, "forOrg">;
  files: Files;
}

const recordOf = (packageId: string) => ({ recordType: PACKAGE_PHOTO_RECORD_TYPE, recordId: packageId });

/** How many photos the package holds, for the page's readiness. */
export async function packagePhotoCount(
  { files }: Pick<PackagePhotoDependencies, "files">,
  access: MemberAccess,
  packageId: string,
): Promise<number> {
  return (await files.list(access, recordOf(packageId))).length;
}

/** The package's photos in the order they arrived, each with a short-lived link to draw it. */
export async function listPackagePhotos(
  dependencies: PackagePhotoDependencies,
  access: MemberAccess,
  packageId: string,
): Promise<PackagePhoto[]> {
  await requirePackage(dependencies, access, packageId);
  return packagePhotoList.parse(await filesWithLinks(dependencies.files, access, recordOf(packageId)));
}

/** Step one of adding a photo: a picture a browser draws, within the size and the six photos, and a place to put it. */
export async function requestPackagePhotoUpload(
  dependencies: PackagePhotoDependencies,
  access: MemberAccess,
  input: {
    packageId: string;
    fileName: string;
    contentType: (typeof packagePhotoContentTypes)[number];
    sizeBytes: number;
  },
) {
  await requirePackage(dependencies, access, input.packageId);
  if (input.sizeBytes > MAX_PACKAGE_PHOTO_BYTES) {
    throw new DomainError("VALIDATION", "ATTACHMENT_TOO_BIG", "A photo can be 5 MB at most");
  }
  const held = await dependencies.files.list(access, recordOf(input.packageId));
  if (held.length >= MAX_PACKAGE_PHOTOS) {
    throw new DomainError("LIMIT_REACHED", "PACKAGE_PHOTO_LIMIT", "A package holds six photos at most");
  }
  const { attachment, upload } = await dependencies.files.requestUpload(access, {
    ...recordOf(input.packageId),
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    sensitive: false,
  });
  return { attachmentId: attachment.id, upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
}

export async function confirmPackagePhoto(
  dependencies: PackagePhotoDependencies,
  access: MemberAccess,
  input: { packageId: string; attachmentId: string },
): Promise<void> {
  await requirePackage(dependencies, access, input.packageId);
  await dependencies.files.confirmUpload(access, { ...recordOf(input.packageId), attachmentId: input.attachmentId });
}

export async function removePackagePhoto(
  dependencies: PackagePhotoDependencies,
  access: MemberAccess,
  input: { packageId: string; attachmentId: string },
): Promise<void> {
  await requirePackage(dependencies, access, input.packageId);
  await dependencies.files.remove(access, { ...recordOf(input.packageId), attachmentId: input.attachmentId });
}
