"use client";

// A fill's value in words, for the review and its "now" beside it: a destination's name, dates as "15 Dec to 20 Dec", a budget
// in rupees, a follow-up as "Thu 3 Dec, 5:00 pm". The same words for what the form holds and what the AI proposes.
import type { FillPath } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { rupees } from "@/components/forms/money-field";
import { formatCalendarDay } from "@/lib/format";

const monthName = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const followUpTime = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC",
});

export function useFillText(): (path: FillPath, value: unknown) => string {
  const t = useTranslations("ai.fill.values");
  const leads = useTranslations("leads");
  const call = useTranslations("leads.call.note");
  return (path, value) => {
    const record = (value ?? {}) as Record<string, unknown>;
    switch (path) {
      case "trip.destination":
        return record.kind === "new" ? t("newDestination", { name: String(record.name) }) : String(record.name);
      case "trip.when":
        if (record.kind === "dates")
          return `${formatCalendarDay(String(record.from))} – ${formatCalendarDay(String(record.to))}`;
        if (record.kind === "month") return monthName.format(new Date(`${String(record.month)}-01T00:00:00Z`));
        return t("flexible");
      case "trip.childrenAges":
        return t("childrenAges", { ages: (value as number[]).join(", ") });
      case "trip.budget": {
        const budget = value as { amount: { amountPaise: number }; basis: "per_person" | "for_everyone" };
        return `${rupees(budget.amount.amountPaise)} ${leads(`budgetBasis.${budget.basis}`)}`;
      }
      case "trip.tripType":
        return leads(`tripTypes.${String(value) as "family"}`);
      case "trip.hotelCategory":
        return leads(`hotelCategories.${String(value) as "3_star"}`);
      case "trip.food":
        return leads(`food.${String(value) as "veg"}`);
      case "call.outcome":
        return call(`outcomes.${String(value) as "spoke"}`);
      case "call.followUp": {
        const followUp = value as { due: { on: string; at: string }; title?: string };
        const when = followUpTime.format(new Date(`${followUp.due.on}T${followUp.due.at}:00Z`));
        return followUp.title ? `${when}, ${followUp.title}` : when;
      }
      case "quote.startDate":
        return formatCalendarDay(String(value));
      case "quote.days":
        return t("days", { count: (value as unknown[]).length });
      case "quote.items":
        return t("items", { count: (value as unknown[]).length });
      default:
        return String(value);
    }
  };
}
