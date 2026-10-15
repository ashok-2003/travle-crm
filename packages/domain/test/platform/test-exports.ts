// An organization's export for the platform module's tests: asked for and written at once, as the console's job
// would, and read back from storage line by line.
import type { OrganizationExport } from "@travel-crm/contracts/platform";
import type { MemoryStorage } from "@travel-crm/integrations/storage";
import { requestOrganizationExport, runOrganizationExport, type PlatformServices } from "../../src/platform/index.js";
import { supportUserId } from "./test-platform.js";

/** Asks for an export and runs its job; it then counts for a purge, as a done export from the last day. */
export async function exportOrganizationNow(
  services: PlatformServices,
  organizationId: string,
  staff: { userId: string } = { userId: supportUserId },
): Promise<OrganizationExport> {
  const requested = await requestOrganizationExport(services, staff, organizationId);
  await runOrganizationExport(services, { exportId: requested.exportId });
  return requested;
}

/** One line of an export part: a table's row, or a person. */
export type ExportLine = { table: string; row: Record<string, unknown> } | { person: Record<string, unknown> };

/** An export's stored parts, by key, in order. */
export function exportParts(storage: MemoryStorage, exported: OrganizationExport): [string, ExportLine[]][] {
  const prefix = `platform/exports/${exported.organizationId}/${exported.exportId}/`;
  return [...storage.objects.entries()]
    .filter(([key]) => key.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, object]) => [
      key,
      new TextDecoder()
        .decode(object.body)
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as ExportLine),
    ]);
}

/** Every line of an export, its parts' in order. */
export function exportLines(storage: MemoryStorage, exported: OrganizationExport): ExportLine[] {
  return exportParts(storage, exported).flatMap(([, lines]) => lines);
}
