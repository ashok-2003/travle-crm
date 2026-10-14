// Finds the product's name outside the brand package (spec 10). Code must read it from @travel-crm/brand, so renaming
// the product is one edit. The spec and plans in docs/ name the product on purpose, so they are skipped.

export interface CheckedFile {
  /** Relative to the repository root, with forward slashes, e.g. "apps/api/src/app.ts". */
  path: string;
  text: string;
}

export interface NameFinding {
  path: string;
  /** 1-based. */
  line: number;
  text: string;
}

/** Folders that may name the product: the brand package itself, and the design documents. */
const exemptFolders = ["packages/brand/", "docs/"];

/** A pattern for one name: any case, and any run of spaces between its words. */
function namePattern(name: string): RegExp {
  const words = name
    .trim()
    .split(/\s+/)
    .map((word) => word.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(words.join("\\s+"), "i");
}

/** Every line, outside the exempt folders and binary files, that contains one of the names. One finding per line. */
export function findProductNameOutsideBrand({
  files,
  names,
}: {
  files: readonly CheckedFile[];
  names: readonly string[];
}): NameFinding[] {
  const patterns = names.map(namePattern);
  return (
    files
      .filter((file) => !exemptFolders.some((folder) => file.path.startsWith(folder)))
      // A NUL character means binary content (images, fonts), which can't carry the name as text.
      .filter((file) => !file.text.includes("\u0000"))
      .flatMap((file) =>
        file.text
          .split(/\r?\n/)
          .map((text, index) => ({ path: file.path, line: index + 1, text }))
          .filter((line) => patterns.some((pattern) => pattern.test(line.text))),
      )
  );
}
