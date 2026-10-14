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

/**
 * A pattern for one name: any case, and between its words any run of whitespace (line breaks included), "-", "_" or
 * "." or nothing at all, so slugs and identifiers ("travel-agency-os", "TravelAgencyOS") are caught too.
 */
function namePattern(name: string): RegExp {
  const words = name
    .trim()
    .split(/\s+/)
    .map((word) => word.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(words.join("[\\s._-]*"), "gi");
}

/**
 * Every place, outside the exempt folders and binary files, where one of the names starts. The whole file is
 * searched, so a name wrapped over two lines is found. One finding per line, for the line where a match starts.
 */
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
      .flatMap((file) => {
        const lines = file.text.split(/\r?\n/);
        return matchedLines(file.text).map((line) => ({ path: file.path, line, text: lines[line - 1] ?? "" }));
      })
  );

  /** The 1-based lines where a match of any pattern starts, ascending and without repeats. */
  function matchedLines(text: string): number[] {
    const found = new Set<number>();
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        found.add(text.slice(0, match.index).split("\n").length);
      }
    }
    return [...found].sort((a, b) => a - b);
  }
}
