// Where the brand's logo files are, for the PDF and email adapters and the icon generator.
import path from "node:path";

const assetsDirectory = path.join(import.meta.dirname, "../assets");

/** Absolute paths to the logo files. Both are square SVG marks drawn with paths only. */
export const brandAssets = {
  /** For light surfaces: an ink mark. */
  logo: path.join(assetsDirectory, "logo.svg"),
  /** For dark surfaces: the same mark in warm white. */
  logoDark: path.join(assetsDirectory, "logo-dark.svg"),
} as const;
