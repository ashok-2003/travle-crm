// The routers the 5B screens fill are served from the start, each at its one place: notifications, attachments,
// documents, share links and the audit log beside the others, and the logo inside the organization's settings.
import { describe, expect, it } from "vitest";
import { appRouter } from "../src/routers/app-router.js";

/** The router's parts by name: tRPC 11.19 keeps them in _def.record, a nested router as a record of its own. */
const record = (appRouter as unknown as { _def: { record: Record<string, Record<string, unknown>> } })._def.record;

describe("the screens' routers", () => {
  it("are registered once, at their names", () => {
    expect(Object.keys(record)).toEqual(
      expect.arrayContaining(["notifications", "attachments", "documents", "shareLinks", "audit", "organization"]),
    );
    expect(Object.keys(record.organization ?? {})).toEqual(
      expect.arrayContaining(["profile", "branding", "setup", "logo"]),
    );
  });
});
