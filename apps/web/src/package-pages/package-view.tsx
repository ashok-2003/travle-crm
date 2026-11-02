// An agency's package page (release 7b), server-rendered so a link preview and a search engine read it: the photos, what the
// trip is and costs, the day plan, what is included, the dates, and the enquiry form. Everything on it is what the agency chose
// to publish: no cost, margin, supplier or seat count.
import type { PublicPackage } from "@travel-crm/contracts/package-pages";
import { money } from "@travel-crm/domain/kernel";
import { MessageCircleIcon, PhoneIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/page-title";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupees } from "@/lib/format";
import { AgencyHeader } from "./agency-header";
import { EnquirySection } from "./enquiry-section";
import { PageFrame } from "./page-frame";

const digitsOf = (phone: string) => phone.replace(/\D/g, "");

export async function PackageView({ page }: { page: PublicPackage }) {
  const t = await getTranslations("packagePages.page");
  const { agency, package: trip } = page;
  const [hero, ...others] = trip.photos;
  const facts = [trip.nights === null ? null : t("nights", { count: trip.nights }), trip.destinationName].filter(
    (fact): fact is string => fact !== null,
  );
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
          <p className="max-w-[65ch] whitespace-pre-line [overflow-wrap:anywhere]">{trip.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href="#enquire">{t("enquire")}</a>
          </Button>
          {agency.phone !== null && (
            <>
              <Button variant="outline" asChild>
                <a href={`tel:${agency.phone}`}>
                  <PhoneIcon aria-hidden="true" />
                  {t("call")}
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={`https://wa.me/${digitsOf(agency.phone)}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircleIcon aria-hidden="true" />
                  {t("whatsapp")}
                </a>
              </Button>
            </>
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
          <ol className="flex flex-col gap-4">
            {trip.days.map((day, index) => (
              <li key={`${String(index)}-${day.title}`}>
                <h3 className="font-semibold">
                  {t("dayLabel", { day: index + 1 })}: {day.title}
                </h3>
                {day.description !== "" && <p className="whitespace-pre-line">{day.description}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {(trip.inclusions !== "" || trip.exclusions !== "") && (
        <section className="grid gap-4 md:grid-cols-2">
          {trip.inclusions !== "" && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{t("inclusions")}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line">{trip.inclusions}</p>
              </CardContent>
            </Card>
          )}
          {trip.exclusions !== "" && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{t("exclusions")}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line">{trip.exclusions}</p>
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {trip.cancellationNotes !== "" && (
        <section aria-labelledby="cancellation" className="flex flex-col gap-3">
          <h2 id="cancellation" className="text-section font-semibold">
            {t("cancellation")}
          </h2>
          <p className="max-w-[65ch] whitespace-pre-line">{trip.cancellationNotes}</p>
        </section>
      )}

      <EnquirySection code={agency.code} page={page} />

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
