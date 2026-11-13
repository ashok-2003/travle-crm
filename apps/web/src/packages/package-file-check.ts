// What a package's brochure may be, checked in the browser before anything is sent: the types and size the api accepts,
// so a wrong file is said so at once and never uploaded.
import { MAX_PACKAGE_BROCHURE_BYTES, packageBrochureContentTypes } from "@travel-crm/contracts/files";

/** Why a file can't be used; also its message key. */
export type PackageFileProblem = "wrongType" | "tooLarge";

export const brochureLimit = MAX_PACKAGE_BROCHURE_BYTES;

export function brochureProblem(file: { type: string; size: number }): PackageFileProblem | null {
  // An empty file is not a file of any type.
  if (!packageBrochureContentTypes.includes(file.type as never) || file.size === 0) return "wrongType";
  return file.size > brochureLimit ? "tooLarge" : null;
}
