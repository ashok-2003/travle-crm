"use client";

// A lead's trip (spec 3.4, R49): where, when, who and the budget always, "Not asked yet" until known, then whatever
// else was asked (leaving from, trip type, hotel, food, room). A per-person budget also says about how much it is for
// everyone once the travellers are known. Edit opens the new-lead form's own trip fields.
import type { LeadDetail, TravelWhen, TripDetail } from "@travel-crm/contracts/crm";
import { multiply, money, yearIn } from "@travel-crm/domain/kernel";
import { useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";
import { Details, type Detail } from "@/components/details";
import { rupees } from "@/components/forms/money-field";
import { formatRupees } from "@/lib/format";
import { useHolds, useMe } from "@/session/me-context";
import { useTripLine } from "../trip-line";
import { EditTripDialog } from "./edit-trip-dialog";
import { ChangeButton, LeadCard } from "./lead-card";

const monthNames = {
  thisYear: new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" }),
  otherYear: new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }),
};

function useTripWords() {
  const t = useTranslations("leads");
  const tripLine = useTripLine();
  const thisYear = yearIn(new Date(), useMe().organization.timeZone);
  const when = (travel: TravelWhen): string | null => {
    switch (travel.kind) {
      case "unknown":
        return null;
      case "flexible":
        return t("lead.trip.flexible");
      case "month": {
        const month = new Date(`${travel.month}-01T00:00:00Z`);
        const name = (month.getUTCFullYear() === thisYear ? monthNames.thisYear : monthNames.otherYear).format(month);
        return t("lead.trip.monthNotFixed", { month: name });
      }
      case "dates":
        return tripLine({ destinationName: null, when: travel, adults: null, childrenCount: 0 });
    }
  };
  /** "2 adults, 1 child (7)". */
  const travellers = (trip: TripDetail): string | null => {
    const ages = trip.childrenAges;
    const adults = trip.adults === null ? null : t("trip.adults", { count: trip.adults });
    const children =
      ages.length === 0
        ? null
        : t("lead.trip.childrenAges", { children: t("trip.children", { count: ages.length }), ages: ages.join(", ") });
    return adults && children ? t("trip.travellers", { adults, children }) : (adults ?? children);
  };
  return { when, travellers };
}

export function TripCard({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("leads");
  const words = useTripWords();
  const canEdit = useHolds("leads:edit");
  const [editing, setEditing] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const { trip } = lead;
  const label = (key: "destination" | "when" | "travellers" | "budget") => t(`lead.trip.labels.${key}`);
  const notAsked = <span className="text-muted-foreground">{t("lead.trip.notAsked")}</span>;
  const headcount = (trip.adults ?? 0) + trip.childrenAges.length;
  const budget = trip.budget;
  const budgetValue: ReactNode = budget
    ? t.rich(budget.basis === "per_person" ? "lead.trip.perPerson" : "lead.trip.forEveryone", {
        amount: rupees(budget.amount.amountPaise),
        number: (chunks) => <span className="numbers">{chunks}</span>,
      })
    : notAsked;
  const everyone =
    budget?.basis === "per_person" && headcount > 0
      ? t("lead.trip.about", { amount: formatRupees(multiply(money(budget.amount.amountPaise), headcount)) })
      : undefined;
  const asked = (key: "departureCity" | "tripType" | "hotelCategory" | "food" | "roomType", value: string | null) =>
    value === null ? [] : [{ label: t(`lead.trip.labels.${key}`), value }];
  const rows: Detail[] = [
    { label: label("destination"), value: trip.destination?.name ?? notAsked },
    { label: label("when"), value: words.when(trip.when) ?? notAsked },
    { label: label("travellers"), value: words.travellers(trip) ?? notAsked },
    { label: label("budget"), value: budgetValue, ...(everyone && { hint: everyone }) },
    ...asked("departureCity", trip.departureCity),
    ...asked("tripType", trip.tripType && t(`tripTypes.${trip.tripType}`)),
    ...asked("hotelCategory", trip.hotelCategory && t(`hotelCategories.${trip.hotelCategory}`)),
    ...asked("food", trip.food && t(`food.${trip.food}`)),
    ...asked("roomType", trip.roomType),
  ];
  return (
    <LeadCard
      title={t("lead.trip.title")}
      action={
        canEdit && (
          <ChangeButton
            label={t("lead.edit")}
            accessibleLabel={t("lead.trip.edit")}
            ref={opener}
            onClick={() => {
              setEditing(true);
            }}
          />
        )
      }
    >
      <Details rows={rows} />
      {canEdit && <EditTripDialog lead={lead} dialog={{ open: editing, setOpen: setEditing }} returnFocusTo={opener} />}
    </LeadCard>
  );
}
