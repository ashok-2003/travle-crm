// A package page as a visitor sees it (release 7b): the agency's name, logo, colour and words, the package as the agency
// published it, its upcoming departures by words, and what the enquiry form needs. The public GET and nothing else builds it,
// so what a visitor reads is exactly these fields: never a cost, a margin, a supplier, a tier line or a seat count. It needs
// no signed-in member: the photo and logo links are the system's.
import { PACKAGE_PHOTO_RECORD_TYPE } from "@travel-crm/contracts/files";
import type { PublicAgency, PublicPackage, PublicPackageList } from "@travel-crm/contracts/package-pages";
import type { Database } from "@travel-crm/db";
import type { Files } from "@travel-crm/domain/files";
import type { Identity } from "@travel-crm/domain/identity";
import { DomainError, calendarDateIn, publicActor } from "@travel-crm/domain/kernel";
import {
  departuresOf,
  pagesAreOn,
  publicPageSettingsOf,
  publishedPackage,
  publishedPackages,
} from "@travel-crm/domain/package-pages";
import type { Profiles } from "@travel-crm/domain/profile";
import { colourWithInk, logoLinkOf, monthsFrom } from "./public-form.js";

export interface PublicPackageServices {
  db: Pick<Database, "forOrg">;
  identity: Pick<Identity, "organizationByCode">;
  profiles: Pick<Profiles, "get">;
  files: Pick<Files, "list" | "systemDownloadLink">;
}

/** What the enquiry says the visitor agrees to by sending. */
export const consentLine = (agencyName: string) => `${agencyName} will use your details only to reply to this enquiry.`;

interface Agency {
  organizationId: string;
  name: string;
  code: string;
  timeZone: string;
}

/** The links to a package's photos, in the order they arrived; a photo that has no link now is left out, never a failure. */
async function photoLinksOf(
  files: Pick<Files, "list" | "systemDownloadLink">,
  organizationId: string,
  packageId: string,
): Promise<string[]> {
  const photos = await files.list(publicActor(organizationId), {
    recordType: PACKAGE_PHOTO_RECORD_TYPE,
    recordId: packageId,
  });
  const links = await Promise.all(
    photos.map(async (photo) => {
      try {
        return (await files.systemDownloadLink(organizationId, { attachmentId: photo.id })).url;
      } catch (error) {
        if (error instanceof DomainError) return null;
        throw error;
      }
    }),
  );
  return links.filter((link): link is string => link !== null);
}

async function agencyOf(
  services: PublicPackageServices,
  agency: Agency,
  settings: { about: string; instagramUrl: string },
): Promise<PublicAgency> {
  const profile = await services.profiles.get(agency.organizationId);
  return {
    name: agency.name,
    code: agency.code.toLowerCase(),
    logoUrl: await logoLinkOf(services.files, agency.organizationId),
    colour: colourWithInk(profile?.brandColour ?? null),
    about: settings.about,
    instagramUrl: settings.instagramUrl === "" ? null : settings.instagramUrl,
    phone: profile?.contactPhone ?? null,
  };
}

async function findAgency(services: PublicPackageServices, code: string): Promise<Agency | null> {
  const organization = await services.identity.organizationByCode(code);
  return organization === null
    ? null
    : {
        organizationId: organization.id,
        name: organization.name,
        code: organization.code,
        timeZone: organization.timeZone,
      };
}

/** The package page, or null: one answer whether the page never existed, is unpublished or the agency turned its pages off. */
export async function publicPackageOf(
  services: PublicPackageServices,
  input: { code: string; slug: string; openedToken: string; turnstileSiteKey: string | null; now: Date },
): Promise<PublicPackage | null> {
  const agency = await findAgency(services, input.code);
  if (agency === null) return null;
  const today = calendarDateIn(input.now, agency.timeZone);
  const found = await services.db.forOrg(agency.organizationId, async (tx) => {
    const row = await publishedPackage(tx, input.slug, { organizationId: agency.organizationId, now: input.now });
    if (row === null) return null;
    return {
      row,
      settings: await publicPageSettingsOf(tx),
      departures: await departuresOf(tx, row, { today, now: input.now }),
    };
  });
  if (found === null) return null;
  const { row } = found;
  return {
    agency: await agencyOf(services, agency, found.settings),
    package: {
      slug: row.slug,
      name: row.name,
      summary: row.summary,
      nights: row.nights,
      destinationName: row.destinationName,
      highlights: row.highlights,
      days: row.days,
      inclusions: row.inclusions,
      exclusions: row.exclusions,
      cancellationNotes: row.cancellationNotes,
      fromPricePaise: row.fromPricePaise,
      photos: (await photoLinksOf(services.files, agency.organizationId, row.id)).map((url) => ({ url })),
    },
    departures: found.departures.map(({ id, startDate, endDate, word, pricePaise }) => ({
      id,
      startDate,
      endDate,
      word,
      pricePaise,
    })),
    form: {
      openedToken: input.openedToken,
      turnstileSiteKey: input.turnstileSiteKey,
      months: monthsFrom(today),
      consentLine: consentLine(agency.name),
    },
  };
}

/** The agency's published packages for its all-packages page, or null when its pages are off or it has none to show. */
export async function publicPackageListOf(
  services: PublicPackageServices,
  input: { code: string; now: Date },
): Promise<PublicPackageList | null> {
  const agency = await findAgency(services, input.code);
  if (agency === null) return null;
  const found = await services.db.forOrg(agency.organizationId, async (tx) => ({
    settings: await publicPageSettingsOf(tx),
    rows: await publishedPackages(tx, { organizationId: agency.organizationId, now: input.now }),
    open: await pagesAreOn(tx, { organizationId: agency.organizationId, now: input.now }),
  }));
  if (!found.open) return null;
  const cards = await Promise.all(
    found.rows.map(async (row) => ({
      slug: row.slug,
      name: row.name,
      summary: row.summary,
      nights: row.nights,
      destinationId: row.destinationId,
      destinationName: row.destinationName,
      fromPricePaise: row.fromPricePaise,
      photoUrl: (await photoLinksOf(services.files, agency.organizationId, row.id))[0] ?? null,
    })),
  );
  const destinations = new Map<string, string>();
  for (const card of cards) {
    if (card.destinationId !== null && card.destinationName !== null)
      destinations.set(card.destinationId, card.destinationName);
  }
  return {
    agency: await agencyOf(services, agency, found.settings),
    packages: cards,
    destinations: [...destinations].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}
