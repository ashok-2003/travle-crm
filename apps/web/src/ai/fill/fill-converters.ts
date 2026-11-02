// Each form's values and the fill's paths, both ways: `read` says what the form holds now at each path (undefined when empty),
// in the same shape a proposal's value has; `patch` says which of the form's values a proposed value sets. Pure, so a form's
// values can be changed without the form (the call note changes the lead's trip from the call's dialog).
import type { FillPath } from "@travel-crm/contracts/ai";
import { paiseFromRupeesText, toE164 } from "@travel-crm/contracts/kernel";
import type { QuoteFormValues } from "@/quotes/quote-form-values";
import type { LeadFormValues } from "@/leads/form/lead-form-values";
import { NOT_ASKED } from "@/leads/form/trip-values";
import { phoneAsTyped } from "@/components/forms/phone-field";
import { rupeesFieldText } from "@/components/forms/money-field";

export type FillValues = Partial<Record<FillPath, unknown>>;

export interface FillConverter<Values> {
  read(values: Values): FillValues;
  patch(path: FillPath, value: unknown): Partial<Values>;
}

const text = (value: string): string | undefined => (value.trim() === "" ? undefined : value.trim());
const whole = (value: string): number | undefined => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : undefined);
const asked = (value: string): string | undefined => (value === NOT_ASKED ? undefined : value);

/** A value the form shows, as the same JSON a proposal has, for telling whether the person has changed it since. */
export function sameValue(path: FillPath, a: unknown, b: unknown): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (path === "trip.destination") {
    const [x, y] = [a, b] as { kind: string; destinationId?: string; name: string }[];
    return (
      x?.kind === y?.kind &&
      (x?.kind === "existing" ? x.destinationId === y?.destinationId : x?.name.toLowerCase() === y?.name.toLowerCase())
    );
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function whenOf(values: LeadFormValues) {
  if (values.whenKind === "dates" && values.from !== "" && values.to !== "") {
    return { kind: "dates", from: values.from, to: values.to };
  }
  if (values.whenKind === "month" && values.month !== "") return { kind: "month", month: values.month };
  return values.whenKind === "flexible" ? { kind: "flexible" } : undefined;
}

export const leadConverter: FillConverter<LeadFormValues> = {
  read(values) {
    const phone = text(values.phone);
    const ages = values.childrenAges.map(whole);
    const paise = paiseFromRupeesText(values.budget);
    return {
      "person.name": text(values.name),
      "person.phone": phone === undefined ? undefined : (toE164(phone) ?? undefined),
      "person.email": text(values.email),
      "person.instagramHandle": text(values.instagramHandle)?.replace(/^@/, "").toLowerCase(),
      "trip.destination": values.destination ?? undefined,
      "trip.when": whenOf(values),
      "trip.adults": whole(values.adults),
      "trip.childrenAges": ages.length > 0 && ages.every((age) => age !== undefined) ? ages : undefined,
      "trip.budget":
        paise === null ? undefined : { amount: { amountPaise: paise, currency: "INR" }, basis: values.budgetBasis },
      "trip.departureCity": text(values.departureCity),
      "trip.tripType": asked(values.tripType),
      "trip.hotelCategory": asked(values.hotelCategory),
      "trip.food": asked(values.food),
      "trip.roomType": text(values.roomType),
      note: text(values.note),
    };
  },
  patch(path, value): Partial<LeadFormValues> {
    const as = value as never;
    switch (path) {
      case "person.name":
        return { name: as };
      case "person.phone":
        return { phone: phoneAsTyped(as) };
      case "person.email":
        return { email: as };
      case "person.instagramHandle":
        return { instagramHandle: as };
      case "trip.destination":
        return { destination: as };
      case "trip.when": {
        const when = value as { kind: "dates" | "month" | "flexible"; from?: string; to?: string; month?: string };
        if (when.kind === "dates") return { whenKind: "dates", from: when.from ?? "", to: when.to ?? "" };
        if (when.kind === "month") return { whenKind: "month", month: when.month ?? "" };
        return { whenKind: "flexible" };
      }
      case "trip.adults":
        return { adults: String(value) };
      case "trip.childrenAges":
        return { childrenAges: (value as number[]).map(String) };
      case "trip.budget": {
        const budget = value as { amount: { amountPaise: number }; basis: LeadFormValues["budgetBasis"] };
        return { budget: rupeesFieldText(budget.amount.amountPaise), budgetBasis: budget.basis };
      }
      case "trip.departureCity":
        return { departureCity: as };
      case "trip.roomType":
        return { roomType: as };
      case "trip.tripType":
        return { tripType: as };
      case "trip.hotelCategory":
        return { hotelCategory: as };
      case "trip.food":
        return { food: as };
      case "note":
        return { note: as };
      default:
        return {};
    }
  },
};

/** The call note's form. */
export interface CallValues {
  outcome: "spoke" | "no_answer" | "busy" | "wrong_number";
  note: string;
  followUp: boolean;
  day: string;
  time: string;
  followUpTitle: string;
}

export const callConverter: FillConverter<CallValues> = {
  read(values) {
    return {
      // The outcome starts as "Spoke": until something else is chosen or written, it is not the person's answer yet.
      "call.outcome": values.outcome !== "spoke" || values.note.trim() !== "" ? values.outcome : undefined,
      "call.note": text(values.note),
      "call.followUp": values.followUp
        ? {
            due: { on: values.day, at: values.time },
            ...(text(values.followUpTitle) === undefined ? {} : { title: text(values.followUpTitle) }),
          }
        : undefined,
    };
  },
  patch(path, value): Partial<CallValues> {
    switch (path) {
      case "call.outcome":
        return { outcome: value as CallValues["outcome"] };
      case "call.note":
        return { note: value as string };
      case "call.followUp": {
        const followUp = value as { due: { on: string; at: string }; title?: string };
        return { followUp: true, day: followUp.due.on, time: followUp.due.at, followUpTitle: followUp.title ?? "" };
      }
      default:
        return {};
    }
  },
};

export const quoteConverter: FillConverter<QuoteFormValues> = {
  read(values) {
    const days = values.days
      .filter((day) => day.title.trim() !== "")
      .map((day) => ({ title: day.title.trim(), description: day.description.trim() }));
    const items = values.items
      .filter((item) => item.description.trim() !== "")
      .map((item) => ({
        description: item.description.trim(),
        detail: item.detail.trim(),
        quantity: whole(item.quantity) ?? 1,
      }));
    const count = (value: string) => {
      const number = whole(value);
      return number === undefined || number === 0 ? undefined : number;
    };
    return {
      "quote.title": text(values.title),
      "quote.startDate": text(values.startDate),
      "quote.adults": count(values.adults),
      "quote.children": count(values.children),
      "quote.days": days.length === 0 ? undefined : days,
      "quote.items": items.length === 0 ? undefined : items,
      "quote.inclusions": text(values.inclusions),
      "quote.exclusions": text(values.exclusions),
      "quote.notes": text(values.notes),
    };
  },
  patch(path, value): Partial<QuoteFormValues> {
    switch (path) {
      case "quote.title":
        return { title: value as string };
      case "quote.startDate":
        return { startDate: value as string };
      case "quote.adults":
        return { adults: String(value) };
      case "quote.children":
        return { children: String(value) };
      case "quote.days":
        return { days: value as QuoteFormValues["days"] };
      case "quote.items":
        // The lines come without a price: it stays empty until the person types it.
        return {
          items: (value as { description: string; detail: string; quantity: number }[]).map((item) => ({
            description: item.description,
            detail: item.detail,
            quantity: String(item.quantity),
            price: "",
          })),
        };
      case "quote.inclusions":
        return { inclusions: value as string };
      case "quote.exclusions":
        return { exclusions: value as string };
      case "quote.notes":
        return { notes: value as string };
      default:
        return {};
    }
  },
};
