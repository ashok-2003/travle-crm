// Copies the icons the brand package renders (its build writes dist/icons) to where the web app serves them,
// public/icons, for the manifest, the favicon and the home-screen icon.
import { cp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { brandAssets } from "@travel-crm/brand/files";

/** The brand package's dist/icons folder, found from its logo file, which it exports. */
export const brandIconsDirectory = path.resolve(path.dirname(brandAssets.logo), "../dist/icons");

/** Replaces targetDirectory with a copy of the brand's icons and returns the file names copied. */
export async function copyBrandIcons(
  targetDirectory: string,
  sourceDirectory = brandIconsDirectory,
): Promise<string[]> {
  const files = await readdir(sourceDirectory).catch(() => {
    throw new Error(`No icons in ${sourceDirectory}: run \`pnpm --filter @travel-crm/brand build\` first`);
  });
  await rm(targetDirectory, { recursive: true, force: true });
  await cp(sourceDirectory, targetDirectory, { recursive: true });
  return files.sort();
}
