// Which import each signed upload confirms (W3): the upload knows only its attachment, so the file step looks the
// import up, and an attachment no import was started for is an error, never a confirm("").
import { describe, expect, it } from "vitest";
import { uploadedImports } from "@/imports/uploaded-imports";

describe("uploaded imports", () => {
  it("gives each upload's import, and refuses an upload no import was started for", () => {
    const imports = uploadedImports();
    imports.remember("attachment-1", "import-1");
    expect(imports.importFor("attachment-1")).toBe("import-1");
    expect(() => imports.importFor("attachment-2")).toThrow("No import was started for this upload");
  });
});
