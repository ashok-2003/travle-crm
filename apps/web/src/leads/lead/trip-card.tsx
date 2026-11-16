"use client";

// A lead's trip (spec 3.4, R49): where, when, who and the budget always, "Not asked yet" until known, then whatever
// else was asked (leaving from, trip type, hotel, food, room). A per-person budget also says about how much it is for
// everyone once the travellers are known. Edit opens the new-lead form's own trip fields.
import type { SuggestedLeadField } from "@travel-crm/contracts/ai";
import type { LeadDetail, TravelWhen, TripDetail } from "@travel-crm/contracts/crm";
import { multiply, money, yearIn } from "@travel-crm/domain/kernel";
import { useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";
import { AiValue } from "@/ai/ai-value";
import { useLeadAiFields } from "@/ai/use-ai";
import { Details, type Detail } from "@/components/details";
import { rupees } from "@/components/forms/money-field";
import { formatRupees } from "@/lib/format";
import { useHolds, useMe } from "@/session/me-context";
import { useTravelDates } from "../trip-line";
import { EditTripDialog } from "./edit-trip-dialog";
import { ChangeButton, LeadCard } from "./lead-card";

const monthNames = {
  thisYear: new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" }),
  otherYear: new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }),
};

function useTripWords() {
  const t = useTranslations("leads");
  const travelDates = useTravelDates();
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
        return travelDates(travel);
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

type TripRow =
  | "destination"
  | "when"
  | "travellers"
  | "budget"
  | "departureCity"
  | "tripType"
  | "hotelCategory"
  | "food"
  | "roomType";

/** The row of the trip card each suggested field shows in. */
const rowOf: Record<SuggestedLeadField, TripRow> = {
  destination: "destination",
  when: "when",
  adults: "travellers",
  children_ages: "travellers",
  budget: "budget",
  departure_city: "departureCity",
  trip_type: "tripType",
  hotel_category: "hotelCategory",
  food: "food",
  room_type: "roomType",
};

export function TripCard({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("leads");
  const suggestions = useLeadAiFields(lead.id).data?.fields ?? [];
  // A row may hold two fields (adults and the children's ages): the newest one's day and words are shown.
  const aiRows = new Map<TripRow, { fields: SuggestedLeadField[]; filledAt: string; excerpt: string }>();
  for (const one of suggestions) {
    const row = rowOf[one.field];
    const before = aiRows.get(row);
    const newest = before === undefined || one.filledAt > before.filledAt ? one : before;
    aiRows.set(row, {
      fields: [...(before?.fields ?? []), one.field],
      filledAt: newest.filledAt,
      excerpt: newest.excerpt,
    });
  }
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
  const everyone: ReactNode =
    budget?.basis === "per_person" && headcount > 0
      ? t.rich("lead.trip.about", {
          amount: formatRupees(multiply(money(budget.amount.amountPaise), headcount)),
          number: (chunks) => <span className="numbers">{chunks}</span>,
        })
      : undefined;
  const asked = (key: "departureCity" | "tripType" | "hotelCategory" | "food" | "roomType", value: string | null) =>
    value === null ? [] : [{ label: t(`lead.trip.labels.${key}`), value: marked(key, value) }];
  // A row the AI filled wears the people violet, with where it came from a tap away.
  const marked = (key: TripRow, value: ReactNode): ReactNode => {
    const ai = aiRows.get(key);
    return ai === undefined ? (
      value
    ) : (
      <AiValue leadId={lead.id} fields={ai.fields} filledAt={ai.filledAt} excerpt={ai.excerpt}>
        {value}
      </AiValue>
    );
  };
  const rows: Detail[] = [
    { label: label("destination"), value: marked("destination", trip.destination?.name ?? notAsked) },
    { label: label("when"), value: marked("when", words.when(trip.when) ?? notAsked) },
    { label: label("travellers"), value: marked("travellers", words.travellers(trip) ?? notAsked) },
    {
      label: label("budget"),
      value: marked("budget", budgetValue),
      ...(everyone === undefined ? {} : { hint: everyone }),
    },
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
