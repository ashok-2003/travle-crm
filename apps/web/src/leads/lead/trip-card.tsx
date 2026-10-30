"use client";

// A lead's trip (spec 3.4, R49): where, when, who and the budget always, "Not asked yet" until known, then whatever
// else was asked (leaving from, trip type, hotel, food, room). A per-person budget also says about how much it is for
// everyone once the travellers are known. Edit opens the new-lead form's own trip fields.
import type { SuggestedLeadField } from "@travel-crm/contracts/ai";
import type { LeadDetail, TravelWhen, TripDetail } from "@travel-crm/contracts/crm";
import { multiply, money, yearIn } from "@travel-crm/domain/kernel";
import { useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";
import { SparklesIcon } from "lucide-react";
import { useDecideLeadAiFields, useLeadAiFields } from "@/ai/use-ai";
import { InfoHint } from "@/components/info-hint";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Details, type Detail } from "@/components/details";
import { useWriteAccess } from "@/subscription/write-access";
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

/** What the AI filled in from the customer's first messages, until a person confirms or dismisses it. */
function SuggestedPanel({ leadId, rows }: { leadId: string; rows: TripRow[] }) {
  const t = useTranslations("leads.lead.trip.suggested");
  const labels = useTranslations("leads.lead.trip.labels");
  const decide = useDecideLeadAiFields(leadId);
  const write = useWriteAccess("change");
  return (
    <div data-ai-suggested className="flex flex-col gap-2 rounded-lg bg-people-tint/50 p-3 text-people-tint-ink">
      <p className="flex items-center gap-2 font-medium">
        <SparklesIcon aria-hidden="true" className="size-4" />
        {t("title", { fields: [...new Set(rows)].map((row) => labels(row)).join(", ") })}
      </p>
      <p className="text-caption">{t("hint")}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={decide.isPending || !write.allowed}
          onClick={() => {
            decide.mutate({ leadId, decision: "confirm" });
          }}
        >
          {t("confirm")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={decide.isPending || !write.allowed}
          onClick={() => {
            decide.mutate({ leadId, decision: "dismiss" });
          }}
        >
          {t("dismiss")}
        </Button>
      </div>
      <RefusalAlert error={decide.error} />
    </div>
  );
}

export function TripCard({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("leads");
  const suggestions = useLeadAiFields(lead.id).data?.fields ?? [];
  const aiRows = new Map(suggestions.map((one) => [rowOf[one.field], one.excerpt]));
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
  // A suggested row's value wears the people violet, with the customer's own words a tap away.
  const marked = (key: TripRow, value: ReactNode): ReactNode => {
    if (!aiRows.has(key)) return value;
    const excerpt = aiRows.get(key);
    return (
      <span className="inline-flex flex-wrap items-center gap-1 rounded-badge bg-people-tint px-1 text-people-tint-ink">
        {value}
        {excerpt !== undefined && excerpt !== "" && (
          <InfoHint term={t("lead.trip.suggested.term")}>{t("lead.trip.suggested.said", { words: excerpt })}</InfoHint>
        )}
      </span>
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
      {canEdit && aiRows.size > 0 && <SuggestedPanel leadId={lead.id} rows={[...aiRows.keys()]} />}
      <Details rows={rows} />
      {canEdit && <EditTripDialog lead={lead} dialog={{ open: editing, setOpen: setEditing }} returnFocusTo={opener} />}
    </LeadCard>
  );
}
