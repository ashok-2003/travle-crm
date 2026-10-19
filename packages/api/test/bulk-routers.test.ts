// Release 2's routers are served from Part 0 on, each at its one place: a feature then edits only its own router's file
// (bulk plan, D1). Each feature's own test says which procedures its router holds.
import { describe, expect, it } from "vitest";
import { appRouter } from "../src/routers/app-router.js";

/** The router's parts by name: tRPC 11.19 keeps them in _def.record, a nested router as a record of its own. */
const record = (appRouter as unknown as { _def: { record: Record<string, Record<string, unknown>> } })._def.record;

describe("the bulk routers", () => {
  it("serves leadImports, leadExports, staffImports and staffExports", () => {
    for (const name of ["leadImports", "leadExports", "staffImports", "staffExports"]) {
      expect(record[name], name).toBeDefined();
    }
  });
});
