// The Turbopack loader drops ".js" from relative imports in our packages' TypeScript, and touches nothing else.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { withoutJsExtensions } = require("../turbopack/workspace-imports-loader.cjs") as {
  withoutJsExtensions: (source: string) => string;
};

describe("workspace imports loader", () => {
  it("drops .js from relative import and export specifiers", () => {
    const source = [
      'import { brand } from "./brand.js";',
      "import type { Money } from '../kernel/money.js';",
      'export * from "./fields.js";',
      'export { pwaIcons, type PwaIcon } from "./icons.js";',
      'const lazy = await import("./later.js");',
    ].join("\n");
    expect(withoutJsExtensions(source)).toBe(
      [
        'import { brand } from "./brand";',
        "import type { Money } from '../kernel/money';",
        'export * from "./fields";',
        'export { pwaIcons, type PwaIcon } from "./icons";',
        'const lazy = await import("./later");',
      ].join("\n"),
    );
  });

  it("leaves package imports, other extensions and ordinary strings alone", () => {
    const source = [
      'import { z } from "zod";',
      'import data from "./data.json";',
      'import { x } from "@travel-crm/contracts/kernel";',
      'const file = "./report.js";',
    ].join("\n");
    expect(withoutJsExtensions(source)).toBe(source);
  });
});
