// The one-off clean-up of files stored more than once (`dedupe-files`): it refuses arguments it doesn't know, counts on
// a dry run and changes nothing, makes the identical files share one object with --apply, and prints organization ids,
// counts and sizes only, never a file's name.
import { randomUUID } from "node:crypto";
import { createPlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { describe, expect, inject, it } from "vitest";
import { dedupeFilesCommand } from "../src/console-commands.js";
import { createTestConsole } from "./support/console.js";
import { createTestServer } from "./support/test-server.js";

describe("the dedupe-files command", () => {
  it("counts on a dry run, shares with --apply, and prints ids and counts only", async () => {
    const server = createTestServer();
    const testConsole = createTestConsole(server);
    const platform = createPlatformClient(inject("dbUrls").platform);
    try {
      const printed = { stdout: [] as string[], stderr: [] as string[] };
      const output = {
        stdout: (line: string) => printed.stdout.push(line),
        stderr: (line: string) => printed.stderr.push(line),
      };
      expect(await dedupeFilesCommand(testConsole.services, ["--organization", "an-agency"], output)).toBe(1);
      expect(await dedupeFilesCommand(testConsole.services, ["--everything"], output)).toBe(1);
      expect(printed.stderr).toEqual([
        "Usage: dedupe-files -- [--apply] [--organization <id>]",
        "Usage: dedupe-files -- [--apply] [--organization <id>]",
      ]);

      const organizationId = await createTestOrganization(platform, "Dedupe command agency");
      const ids: string[] = [];
      for (const recordType of ["trip_kit", "whatsapp_message"]) {
        const row = await platform.attachment.create({
          data: {
            organizationId,
            recordType,
            recordId: randomUUID(),
            fileName: "Secret plans.pdf",
            contentType: "application/pdf",
            sizeBytes: 2 * 1024 * 1024,
            status: "ready",
            confirmedAt: new Date(),
          },
        });
        await testConsole.services.storage.put({
          key: `organizations/${organizationId}/attachments/${row.id}`,
          contentType: "application/pdf",
          body: new Uint8Array(2 * 1024 * 1024),
        });
        ids.push(row.id);
      }
      const scope = ["--", "--organization", organizationId];

      printed.stdout = [];
      expect(await dedupeFilesCommand(testConsole.services, scope, output)).toBe(0);
      expect(printed.stdout).toEqual([
        `${organizationId}: 1 file, 2.0 MB`,
        "Dry run: 1 file can share another's stored bytes, freeing 2.0 MB. Add --apply to do it.",
      ]);
      expect(await platform.attachment.count({ where: { organizationId, storedAsId: { not: null } } })).toBe(0);

      printed.stdout = [];
      expect(await dedupeFilesCommand(testConsole.services, [...scope, "--apply"], output)).toBe(0);
      expect(printed.stdout).toEqual([
        `${organizationId}: 1 file, 2.0 MB`,
        "Shared another's stored bytes: 1 file. The console's job deletes the 2.0 MB of their own copies.",
      ]);
      expect(await platform.attachment.findMany({ where: { organizationId }, orderBy: { recordType: "asc" } })).toEqual(
        [
          expect.objectContaining({ id: ids[0], storedAsId: null }),
          expect.objectContaining({ id: ids[1], storedAsId: ids[0] }),
        ],
      );
      expect(printed.stdout.join("\n")).not.toContain("Secret");
    } finally {
      await platform.$disconnect();
      await testConsole.close();
      await server.close();
    }
  });
});
