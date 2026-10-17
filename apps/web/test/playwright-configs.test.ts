// @vitest-environment node
// The Playwright configs. A run empties its output folder as it starts, so the journeys' output folder holds neither
// the visual audit's shots (AUDIT_OUT, test-results/audit by default: test/e2e/audit/camera.ts) nor the audit run's
// own folder, and a journey run after an audit never wipes the shots a review is reading. The audit's browser runs on
// UTC, far from the agencies' Asia/Kolkata, so a shot shows times in the agency's zone only if the screen puts them
// there.
import path from "node:path";
import { describe, expect, it } from "vitest";
import audit from "../playwright.audit.config";
import journeys from "../playwright.config";

const web = path.resolve(import.meta.dirname, "..");
/** Whether `folder` is `outer` or inside it. */
const within = (folder: string, outer: string) => !path.relative(outer, folder).startsWith("..");

describe("the Playwright configs", () => {
  it("keep the journeys' output apart from the audit's shots and its run", () => {
    expect(journeys.outputDir).toBeDefined();
    const journeysOut = path.resolve(web, journeys.outputDir ?? "test-results");
    const shots = path.resolve(web, "test-results/audit");
    const auditRun = path.resolve(web, audit.outputDir ?? "test-results");
    expect(within(shots, journeysOut)).toBe(false);
    expect(within(auditRun, journeysOut)).toBe(false);
    expect(within(journeysOut, shots)).toBe(false);
  });

  it("run the audit's browser on UTC, apart from the agencies' zone", () => {
    expect(audit.use?.timezoneId).toBe("UTC");
  });
});
