// Whether the agency's public package pages are on, and what they say about the agency (release 7b). Off until the agency
// decides; whoever holds settings:manage switches them. Audited.
import {
  publicPageSettings,
  type PublicPageSettings,
  type SavePublicPageSettingsInput,
} from "@travel-crm/contracts/package-pages";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";

const columns = { enabled: true, about: true, instagramUrl: true } as const;
const defaults: PublicPageSettings = { enabled: false, about: "", instagramUrl: "" };

export async function publicPageSettingsOf(tx: OrgTx): Promise<PublicPageSettings> {
  const row = await tx.publicPageSettings.findFirst({ select: columns });
  return publicPageSettings.parse(row ?? defaults);
}

export async function savePublicPageSettings(
  tx: OrgTx,
  access: MemberAccess,
  input: SavePublicPageSettingsInput,
): Promise<PublicPageSettings> {
  const before = await publicPageSettingsOf(tx);
  const data = { ...input, updatedBy: access.userId };
  const existing = await tx.publicPageSettings.findFirst({ select: { organizationId: true } });
  const row =
    existing === null
      ? await tx.publicPageSettings.create({ data, select: columns })
      : await tx.publicPageSettings.update({
          where: { organizationId: existing.organizationId },
          data,
          select: columns,
        });
  await recordAudit(tx, access, {
    action: "public-pages.settings-changed",
    entityType: "public_page_settings",
    entityId: access.organizationId,
    before: { enabled: before.enabled },
    after: { enabled: row.enabled },
  });
  return publicPageSettings.parse(row);
}
