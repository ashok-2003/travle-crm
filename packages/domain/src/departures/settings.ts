// How the agency's departures behave (release 7a): how long a hold lasts, when a departure reads "Filling fast", and how many
// heads a room takes by default. One row for the organization, made when first saved; the defaults hold until then.
import type { DepartureSettingsView, SaveDepartureSettingsInput } from "@travel-crm/contracts/departures";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { departureSettingsOf } from "./rows.js";

export const departureSettingsView = (tx: OrgTx): Promise<DepartureSettingsView> => departureSettingsOf(tx);

export async function saveDepartureSettings(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveDepartureSettingsInput,
): Promise<void> {
  const before = await departureSettingsOf(tx);
  await tx.departureSettings.upsert({
    where: { organizationId: access.organizationId },
    create: { ...input, updatedBy: access.userId },
    update: { ...input, updatedBy: access.userId },
  });
  await recordAudit(tx, access, {
    action: "departure-settings.changed",
    entityType: "departure_settings",
    entityId: access.organizationId,
    before: { ...before },
    after: { ...input },
  });
}
