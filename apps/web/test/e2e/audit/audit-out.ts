// Where the visual audit's camera (camera.ts) saves its shots: AUDIT_OUT, or test-results/audit in the web app. Apart
// from the camera, which needs Playwright, so the configs' unit test (test/playwright-configs.test.ts) checks this very
// default rather than a copy of it.
import path from "node:path";

const webDirectory = path.resolve(import.meta.dirname, "../../..");

/** The shots' folder when AUDIT_OUT says nothing. */
export function defaultAuditOut(): string {
  return path.resolve(webDirectory, "test-results/audit");
}

/** Where the shots go: AUDIT_OUT, resolved from the web app, or the default (the config keeps Playwright's own out). */
export function auditOut(): string {
  const chosen = process.env.AUDIT_OUT;
  return chosen === undefined ? defaultAuditOut() : path.resolve(webDirectory, chosen);
}
