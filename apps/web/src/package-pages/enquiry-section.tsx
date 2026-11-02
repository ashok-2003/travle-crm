"use client";

// The dates of a package and its enquiry form on its public page (release 7b). Joining a date fixes the date and asks for seats
// (on a full date, the waitlist); without one the visitor says when they would like to travel. Both land as a lead. The form
// is the website form's in its pieces: the bot check, one submission id for every attempt, the honeypot, and the sentences for
// a refusal. Nothing is stored in the browser or in the address.
import type { PublicPackage } from "@travel-crm/contracts/package-pages";
import { money } from "@travel-crm/domain/kernel";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { formatCalendarDay, formatRupees } from "@/lib/format";
import { EnquiryForm } from "./enquiry-form";

const toneOf: Record<PublicPackage["departures"][number]["word"], StatusTone> = {
  open: "good",
  filling: "attention",
  full: "bad",
};

export function EnquirySection({ code, page }: { code: string; page: PublicPackage }) {
  const t = useTranslations("packagePages.page");
  const [chosenId, setChosenId] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const chosen = page.departures.find((departure) => departure.id === chosenId) ?? null;
  return (
    <>
      {page.departures.length > 0 && (
        <section aria-labelledby="departures" className="flex flex-col gap-3">
          <div>
            <h2 id="departures" className="text-section font-semibold">
              {t("departures")}
            </h2>
            <p className="text-muted-foreground">{t("departuresIntro")}</p>
          </div>
          <ItemGroup>
            {page.departures.map((departure) => {
              const day = formatCalendarDay(departure.startDate);
              return (
                <Item key={departure.id} role="listitem">
                  <ItemContent>
                    <ItemTitle>
                      {t("departureDates", {
                        from: formatCalendarDay(departure.startDate),
                        to: formatCalendarDay(departure.endDate),
                      })}
                    </ItemTitle>
                    <ItemDescription className="numbers">
                      {departure.pricePaise === null
                        ? ""
                        : t("departurePrice", { price: formatRupees(money(departure.pricePaise)) })}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="flex-wrap">
                    <StatusBadge tone={toneOf[departure.word]}>{t(`words.${departure.word}`)}</StatusBadge>
                    <Button
                      variant="outline"
                      aria-label={departure.word === "full" ? t("waitlistNamed", { day }) : t("joinNamed", { day })}
                      onClick={() => {
                        setChosenId(departure.id);
                        document.getElementById("enquire")?.scrollIntoView({ behavior: "smooth", block: "start" });
                        heading.current?.focus();
                      }}
                    >
                      {departure.word === "full" ? t("waitlist") : t("join")}
                    </Button>
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        </section>
      )}
      <section id="enquire" aria-labelledby="enquire-heading" className="scroll-mt-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 id="enquire-heading" ref={heading} tabIndex={-1} className="outline-none">
                <EnquiryHeading name={page.package.name} departure={chosen} />
              </h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EnquiryForm
              // A new form for each date chosen, so what was typed for another is not carried into it.
              key={chosenId ?? "general"}
              code={code}
              slug={page.package.slug}
              agencyName={page.agency.name}
              form={page.form}
              departure={chosen}
              onWithoutDate={() => {
                setChosenId(null);
              }}
            />
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function EnquiryHeading({ name, departure }: { name: string; departure: PublicPackage["departures"][number] | null }) {
  const t = useTranslations("packagePages.form");
  if (departure === null) return t("heading", { name });
  const day = formatCalendarDay(departure.startDate);
  return departure.word === "full" ? t("headingWaitlist", { day }) : t("headingJoin", { day });
}
