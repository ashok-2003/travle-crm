// Request check 3 everywhere (spec 6.5): every procedure the api serves says which plan module it belongs to, or that
// it is the Foundation's own ("core"), so none can skip the check by having no permission to require.
import { planModules } from "@travel-crm/contracts/subscriptions";
import { describe, expect, it } from "vitest";
import { appRouter } from "../src/routers/app-router.js";

const declarable: readonly unknown[] = [...planModules, "core"];

describe("request check 3 on every procedure", () => {
  it("has every procedure of the app router declare its plan module, or core", () => {
    // Flat at run time, by dotted path, though typed as the nested router (tRPC 11.19's createRouterFactory,
    // dist/tracked-D4jU_Hb3.mjs: `procedures[newPath] = item`).
    const flat = appRouter._def.procedures as unknown as Record<string, { _def: { meta?: unknown } }>;
    const procedures = Object.entries(flat);
    expect(procedures.length).toBeGreaterThan(0);
    const undeclared = procedures
      .filter(([, procedure]) => {
        const meta = procedure._def.meta as { planModule?: unknown } | undefined;
        return !declarable.includes(meta?.planModule);
      })
      .map(([path]) => path);
    expect(undeclared).toEqual([]);
  });
});
