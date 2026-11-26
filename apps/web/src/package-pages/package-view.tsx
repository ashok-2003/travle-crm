// An agency's package page (release 7b), server-rendered so a link preview and a search engine read it: the trip's name, nights
// and price, its next dates in words, then the photos, the day plan in boxes, what is and is not included, the dates and the
// enquiry form, and WhatsApp us at the end. Everything on it is what the agency chose
// to publish: no cost, margin, supplier or seat count. Call dials the agency's contact phone; WhatsApp opens its main
// WhatsApp number (the api gives the contact phone when no number is connected).
import type { PublicPackage } from "@travel-crm/contracts/package-pages";
import { money } from "@travel-crm/domain/kernel";
import { MessageCircleIcon, PhoneIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/page-title";
import { TextLink } from "@/components/text-link";
import { DayBoxes } from "@/components/trip-plan/day-boxes";
import { PointList } from "@/components/trip-plan/point-list";
import { Button } from "@/components/ui/button";
import { formatCalendarDay, formatRupees } from "@/lib/format";
import { AgencyHeader } from "./agency-header";
import { EnquirySection } from "./enquiry-section";
import { PageFrame } from "./page-frame";

const digitsOf = (phone: string) => phone.replace(/\D/g, "");

export async function PackageView({ page }: { page: PublicPackage }) {
  const t = await getTranslations("packagePages.page");
  const { agency, package: trip } = page;
  const [hero, ...others] = trip.photos;
  // The api's number already falls back to the contact phone, so it is null only with neither; an older api's answer
  // has none (read as null), and the button then opens the contact phone, as before this release.
  const whatsapp = agency.whatsapp ?? agency.phone;
  const facts = [trip.nights === null ? null : t("nights", { count: trip.nights }), trip.destinationName].filter(
    (fact): fact is string => fact !== null,
  );
  const nextDepartures = page.departures.slice(0, 3);
  return (
    <PageFrame agency={agency}>
      <AgencyHeader agency={agency} withList />
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <PageTitle className="[overflow-wrap:anywhere]">{trip.name}</PageTitle>
          {facts.length > 0 && <p className="text-muted-foreground">{facts.join(" · ")}</p>}
          <p className="numbers text-section font-semibold">
            {trip.fromPricePaise === null
              ? t("onEnquiry")
              : t("fromPrice", { price: formatRupees(money(trip.fromPricePaise)) })}
          </p>
          {nextDepartures.length > 0 && (
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">{t("nextDepartures")}</span>{" "}
              {nextDepartures
                .map((departure) => `${formatCalendarDay(departure.startDate)} · ${t(`words.${departure.word}`)}`)
                .join(", ")}
            </p>
          )}
          <p className="max-w-[65ch] whitespace-pre-line [overflow-wrap:anywhere]">{trip.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href="#enquire">{t("askAbout")}</a>
          </Button>
          {agency.phone !== null && (
            <Button variant="outline" asChild>
              <a href={`tel:${agency.phone}`}>
                <PhoneIcon aria-hidden="true" />
                {t("call")}
              </a>
            </Button>
          )}
        </div>
      </section>

      {hero !== undefined && (
        <section className="flex flex-col gap-3">
          {/* Presigned links to storage, which Next's image optimiser can't fetch. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero.url}
            alt={t("photoAlt", { name: trip.name, number: 1 })}
            fetchPriority="high"
            className="aspect-video w-full rounded-card object-cover"
          />
          {others.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {others.map((photo, index) => (
                <li key={photo.url}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={t("photoAlt", { name: trip.name, number: index + 2 })}
                    loading="lazy"
                    className="aspect-4/3 w-full rounded-card object-cover"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {trip.highlights.length > 0 && (
        <section aria-labelledby="highlights" className="flex flex-col gap-3">
          <h2 id="highlights" className="text-section font-semibold">
            {t("highlights")}
          </h2>
          <ul className="list-disc pl-5">
            {trip.highlights.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {trip.days.length > 0 && (
        <section aria-labelledby="days" className="flex flex-col gap-3">
          <h2 id="days" className="text-section font-semibold">
            {t("days")}
          </h2>
          <DayBoxes days={trip.days} />
        </section>
      )}

      {(
        [
          ["inclusions", trip.inclusions, "included"],
          ["exclusions", trip.exclusions, "excluded"],
          ["cancellation", trip.cancellationNotes, "plain"],
        ] as const
      ).map(
        ([key, text, tone]) =>
          text.trim() !== "" && (
            <section key={key} className="flex flex-col gap-3">
              <h2 className="text-section font-semibold">{t(key)}</h2>
              <PointList text={text} tone={tone} />
            </section>
          ),
      )}

      <EnquirySection code={agency.code} page={page} />

      {whatsapp !== null && (
        <Button variant="outline" asChild className="self-start">
          <a href={`https://wa.me/${digitsOf(whatsapp)}`} target="_blank" rel="noopener noreferrer">
            <MessageCircleIcon aria-hidden="true" />
            {t("whatsapp")}
          </a>
        </Button>
      )}

      {(agency.about !== "" || agency.instagramUrl !== null) && (
        <footer className="flex flex-col gap-2">
          <h2 className="text-section font-semibold">{t("about", { name: agency.name })}</h2>
          {agency.about !== "" && <p className="max-w-[65ch] whitespace-pre-line">{agency.about}</p>}
          {agency.instagramUrl !== null && (
            <TextLink href={agency.instagramUrl} newTab>
              {t("instagram")}
            </TextLink>
          )}
        </footer>
      )}
    </PageFrame>
  );
}
