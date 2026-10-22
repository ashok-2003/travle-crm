// The settings page's view of the form (spec 3.2): the saved settings, or the defaults of W2 before the first save, the two
// links, why the form is closed and whom the leads go to. Opening the page writes nothing.
import { features } from "@travel-crm/contracts/features";
import type { WebsiteFormSettings, WebsiteFormView } from "@travel-crm/contracts/website-forms";
import type { Database } from "@travel-crm/db";
import type { Identity } from "@travel-crm/domain/identity";
import { formKeyOf, formOpenState, readWebsiteForm, type WebsiteFormRow } from "@travel-crm/domain/website-forms";
import { memberNames } from "./member-names.js";

/** What a form has before its first save (W2): off, with the fixed core and the other fields as the owner chose. */
export const defaultSettings: WebsiteFormSettings = {
  enabled: false,
  allowEmbed: true,
  emailMode: "optional",
  destinationMode: "optional",
  destinationInput: "list",
  travelMonthMode: "optional",
  travellersMode: "optional",
  budgetMode: "off",
  messageMode: "optional",
  offersTickbox: false,
  heading: null,
  introduction: null,
  thankYouMessage: null,
  websiteUrl: null,
  websiteButtonText: null,
  privacyUrl: null,
};

export function settingsOf(row: WebsiteFormRow | null): WebsiteFormSettings {
  if (row === null) return defaultSettings;
  return {
    enabled: row.enabled,
    allowEmbed: row.allowEmbed,
    emailMode: row.emailMode,
    destinationMode: row.destinationMode,
    destinationInput: row.destinationInput,
    travelMonthMode: row.travelMonthMode,
    travellersMode: row.travellersMode,
    budgetMode: row.budgetMode,
    messageMode: row.messageMode,
    // While the switch is off the tickbox is not offered, whatever an earlier save held.
    offersTickbox: row.offersTickbox && features.marketingConsent,
    heading: row.heading,
    introduction: row.introduction,
    thankYouMessage: row.thankYouMessage,
    websiteUrl: row.websiteUrl,
    websiteButtonText: row.websiteButtonText,
    privacyUrl: row.privacyUrl,
  };
}

export async function viewOf(
  services: { db: Pick<Database, "forOrg">; identity: Identity },
  input: { organizationId: string; appUrl: string; now: Date },
): Promise<WebsiteFormView> {
  const { organizationId } = input;
  const ownerUserId = await services.identity.firstOwner(organizationId);
  const names = await memberNames(services.identity, organizationId, [ownerUserId]);
  const { row, state, hasDestinations } = await services.db.forOrg(organizationId, async (tx) => {
    const found = await readWebsiteForm(tx);
    return {
      row: found,
      state: await formOpenState(tx, { organizationId, form: found, ownerUserId, now: input.now }),
      hasDestinations: (await tx.destination.findFirst({ select: { id: true } })) !== null,
    };
  });
  const base = input.appUrl.replace(/\/+$/, "");
  const key = row === null ? null : formKeyOf(organizationId, row.keySecret);
  return {
    settings: settingsOf(row),
    key,
    link: key === null ? null : `${base}/f/${key}`,
    embedLink: key === null ? null : `${base}/embed/${key}`,
    state,
    ownerName: ownerUserId === null ? null : (names[ownerUserId] ?? null),
    hasDestinations,
  };
}
