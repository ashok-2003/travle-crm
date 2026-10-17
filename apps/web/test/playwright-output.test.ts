// @vitest-environment node
// Playwright empties a run's output folder when the run starts. The journeys' output folder must therefore hold
// neither the visual audit's shots (AUDIT_OUT, test-results/audit by default: test/e2e/audit/camera.ts) nor the
// audit run's own folder, so a journey run after an audit never wipes the shots a review is reading.
import path from "node:path";
import { describe, expect, it } from "vitest";
import audit from "../playwright.audit.config";
import journeys from "../playwright.config";

const web = path.resolve(import.meta.dirname, "..");
/** Whether `folder` is `outer` or inside it. */
const within = (folder: string, outer: string) => !path.relative(outer, folder).startsWith("..");

describe("the Playwright output folders", () => {
  it("keep the journeys' output apart from the audit's shots and its run", () => {
    expect(journeys.outputDir).toBeDefined();
    const journeysOut = path.resolve(web, journeys.outputDir ?? "test-results");
    const shots = path.resolve(web, "test-results/audit");
    const auditRun = path.resolve(web, audit.outputDir ?? "test-results");
    expect(within(shots, journeysOut)).toBe(false);
    expect(within(auditRun, journeysOut)).toBe(false);
    expect(within(journeysOut, shots)).toBe(false);
  });
});
