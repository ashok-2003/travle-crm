// The form as a visitor sees it (spec 7.4, 8): the agency's name, logo, colour, words and fields, the destinations offered
// and the twelve months to choose from. The public GET and the settings Preview build it with this one function, so the
// preview is what a visitor gets. It needs no signed-in member: the logo link is the system's.
import { features } from "@travel-crm/contracts/features";
import { LOGO_RECORD_TYPE } from "@travel-crm/contracts/profile";
import { offersWording, type PublicForm, type SaveWebsiteFormInput } from "@travel-crm/contracts/website-forms";
import type { Database } from "@travel-crm/db";
import { offeredDestinations } from "@travel-crm/domain/crm";
import type { Files } from "@travel-crm/domain/files";
import type { Identity } from "@travel-crm/domain/identity";
import { calendarDateIn, publicActor } from "@travel-crm/domain/kernel";
import type { Profiles } from "@travel-crm/domain/profile";

/** The sentence a visitor reads after sending when the agency wrote none; the form's words are ours, in English (W3). */
export const DEFAULT_THANK_YOU = "Thank you. We have your details and will be in touch soon.";

/** The token the settings Preview carries: it opens nothing, and the preview never sends. */
export const PREVIEW_TOKEN = "preview";

const WHITE = "#ffffff";
const NEAR_BLACK = "#111111";
const MIN_CONTRAST = 4.5;

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
};

/** The agency's colour and the ink that reads on it at 4.5:1 (white or near-black); null when it has none or neither reads. */
export function colourWithInk(colour: string | null): PublicForm["colour"] {
  if (colour === null || !/^#[0-9A-Fa-f]{6}$/.test(colour)) return null;
  const primary = colour.toLowerCase();
  const ink = [WHITE, NEAR_BLACK].find((candidate) => contrast(primary, candidate) >= MIN_CONTRAST);
  return ink === undefined ? null : { primary, ink };
}

/** "2026-11" for the month containing `today` and the eleven after it. */
export function monthsFrom(today: string): string[] {
  const [year = 1970, month = 1] = today.split("-").map(Number);
  return Array.from({ length: 12 }, (_, offset) => {
    const index = year * 12 + (month - 1) + offset;
    return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
  });
}

export interface PublicFormServices {
  db: Pick<Database, "forOrg">;
  identity: Pick<Identity, "organizationProfile">;
  profiles: Pick<Profiles, "get">;
  files: Pick<Files, "list" | "systemDownloadLink">;
}

/** The form for these settings (saved or not), as the public GET and the Preview hand it out. */
export async function publicFormOf(
  services: PublicFormServices,
  input: {
    organizationId: string;
    settings: SaveWebsiteFormInput;
    openedToken: string;
    turnstileSiteKey: string | null;
    now: Date;
  },
): Promise<PublicForm> {
  const { organizationId, settings } = input;
  const organization = await services.identity.organizationProfile(organizationId);
  if (organization === null) throw new Error("A form needs its organization");
  const profile = await services.profiles.get(organizationId);
  const logos = await services.files.list(publicActor(organizationId), {
    recordType: LOGO_RECORD_TYPE,
    recordId: organizationId,
  });
  const logo = logos.at(-1);
  const logoUrl =
    logo === undefined
      ? null
      : (await services.files.systemDownloadLink(organizationId, { attachmentId: logo.id })).url;
  const destinations = await services.db.forOrg(organizationId, (tx) => offeredDestinations(tx));
  const tickbox = settings.offersTickbox && features.marketingConsent;
  return {
    organizationName: organization.name,
    logoUrl,
    colour: colourWithInk(profile?.brandColour ?? null),
    heading: settings.heading,
    introduction: settings.introduction,
    thankYouMessage: settings.thankYouMessage ?? DEFAULT_THANK_YOU,
    websiteUrl: settings.websiteUrl,
    websiteButtonText: settings.websiteButtonText,
    privacyUrl: settings.privacyUrl,
    fields: {
      email: settings.emailMode,
      destination: settings.destinationMode,
      travelMonth: settings.travelMonthMode,
      travellers: settings.travellersMode,
      budget: settings.budgetMode,
      message: settings.messageMode,
    },
    offersTickbox: tickbox,
    offersWording: tickbox ? offersWording(organization.name) : null,
    destinations,
    months: monthsFrom(calendarDateIn(input.now, organization.timeZone)),
    openedToken: input.openedToken,
    turnstileSiteKey: input.turnstileSiteKey,
  };
}
