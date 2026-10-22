// The form as a visitor sees it (spec 7.4, 8): the agency's name, logo, colour, words and fields, the destinations offered
// and the twelve months to choose from. The public GET and the settings Preview build it with this one function, so the
// preview is what a visitor gets. It needs no signed-in member: the logo link is the system's.
import { features } from "@travel-crm/contracts/features";
import { LOGO_RECORD_TYPE } from "@travel-crm/contracts/profile";
import {
  offersWording,
  type ClosedPublicForm,
  type FormVia,
  type PublicForm,
  type SaveWebsiteFormInput,
  type WebsiteFormPublic,
} from "@travel-crm/contracts/website-forms";
import type { Database } from "@travel-crm/db";
import { offeredDestinations } from "@travel-crm/domain/crm";
import type { Files } from "@travel-crm/domain/files";
import type { Identity } from "@travel-crm/domain/identity";
import { DomainError, calendarDateIn, publicActor } from "@travel-crm/domain/kernel";
import type { Profiles } from "@travel-crm/domain/profile";

/** What a visitor reads after sending when the agency wrote nothing (spec 3.2); the form's words are ours, in English (W3). */
export function defaultThankYou(agencyName: string): string {
  return `Thank you! ${agencyName} will get in touch with you soon.`;
}

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

/**
 * A short-lived link to the agency's newest logo, or null when there is none to show: a logo that is sensitive or not
 * ready is "no logo", never a failure of the whole form. Used by the form and by the closed card.
 */
export async function logoLinkOf(
  files: Pick<Files, "list" | "systemDownloadLink">,
  organizationId: string,
): Promise<string | null> {
  const logos = await files.list(publicActor(organizationId), {
    recordType: LOGO_RECORD_TYPE,
    recordId: organizationId,
  });
  const logo = logos.at(-1);
  if (logo === undefined) return null;
  try {
    return (await files.systemDownloadLink(organizationId, { attachmentId: logo.id })).url;
  } catch (error) {
    if (error instanceof DomainError) return null;
    throw error;
  }
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
  const logoUrl = await logoLinkOf(services.files, organizationId);
  const destinations = await services.db.forOrg(organizationId, (tx) => offeredDestinations(tx));
  const tickbox = settings.offersTickbox && features.marketingConsent;
  return {
    organizationName: organization.name,
    logoUrl,
    colour: colourWithInk(profile?.brandColour ?? null),
    heading: settings.heading,
    introduction: settings.introduction,
    thankYouMessage: settings.thankYouMessage ?? defaultThankYou(organization.name),
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

/** The card a visitor sees when the form is closed to them: the agency's name, logo and the way back to its website. */
export async function closedFormOf(
  services: Pick<PublicFormServices, "identity" | "files">,
  input: { organizationId: string; websiteUrl: string | null; websiteButtonText: string | null },
): Promise<ClosedPublicForm> {
  const organization = await services.identity.organizationProfile(input.organizationId);
  if (organization === null) throw new Error("A form needs its organization");
  return {
    organizationName: organization.name,
    logoUrl: await logoLinkOf(services.files, input.organizationId),
    websiteUrl: input.websiteUrl,
    websiteButtonText: input.websiteButtonText,
  };
}

/**
 * What the public GET answers for a form that is otherwise open: the form, or, for an embed the agency switched off, the
 * closed card. (Whether the form is open at all is assertFormOpen's, which the route runs first.)
 */
export async function websiteFormPublicOf(
  services: PublicFormServices,
  input: Parameters<typeof publicFormOf>[1] & { via: FormVia },
): Promise<WebsiteFormPublic> {
  if (input.via === "embedded" && !input.settings.allowEmbed) {
    return {
      available: false,
      form: await closedFormOf(services, { organizationId: input.organizationId, ...input.settings }),
    };
  }
  return { available: true, form: await publicFormOf(services, input) };
}
