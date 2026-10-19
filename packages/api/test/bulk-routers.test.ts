// Release 2's routers are served from Part 0 on, each at its one place, empty until its feature fills it: a feature
// then edits only its own router's file (bulk plan, D1).
import { describe, expect, it } from "vitest";
import { appRouter } from "../src/routers/app-router.js";

/** The router's parts by name: tRPC 11.19 keeps them in _def.record, a nested router as a record of its own. */
const record = (appRouter as unknown as { _def: { record: Record<string, Record<string, unknown>> } })._def.record;

describe("the bulk routers", () => {
  it("serves leadImports and leadExports, empty until their features", () => {
    for (const name of ["leadImports", "leadExports"]) expect(record[name], name).toEqual({});
  });

  it("serves the staff import's and export's procedures", () => {
    expect(Object.keys(record.staffImports ?? {}).sort()).toEqual(
      ["add", "cancel", "confirmUpload", "get", "match", "recent", "rows", "setPasswords", "start"].sort(),
    );
    expect(Object.keys(record.staffExports ?? {}).sort()).toEqual(["downloadLink", "get", "start"]);
  });
});
