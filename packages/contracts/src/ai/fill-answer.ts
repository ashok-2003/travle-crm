// What the model answers when it fills a form: flat keys, every one optional, in the words the source used (a date as "kal", a
// budget as "1 lakh"). Parsed leniently: a key it doesn't know is dropped, a value of the wrong kind is dropped, and code
// (resolve.ts) turns the rest into the form's own values. There is no key for a price, a tax, a GST place, a payment or a
// booking status, so none can come through, whatever the model writes.
import { z } from "zod";

const cut = (max: number) => (value: string) => value.trim().slice(0, max);
/** A value of the right kind, or undefined: null, a missing key and a wrong kind all become "not said". */
const lenient = <Schema extends z.ZodType>(schema: Schema) =>
  schema
    .nullish()
    .catch(undefined)
    .transform((value) => value ?? undefined);
const words = (max: number) =>
  lenient(
    z
      .string()
      .transform(cut(max))
      .transform((value) => (value === "" ? undefined : value)),
  );
const whole = lenient(
  z
    .union([z.number(), z.string()])
    .transform((value) => Number(String(value).replace(/[^\d.]/g, "")))
    .pipe(z.number())
    .transform(Math.round),
);
const wholes = lenient(
  z.array(
    z
      .union([z.number(), z.string()])
      .transform((value) => Number(String(value).replace(/[^\d.]/g, "")))
      .pipe(z.number())
      .transform(Math.round),
  ),
);
const flag = lenient(z.boolean());

const common = {
  /** The words each key came from, by key: "dateFrom": "15 December se". */
  excerpts: lenient(z.record(z.string(), z.unknown())),
  /** What the form needs and the source didn't say. */
  questions: z
    .array(z.string().transform(cut(200)))
    .max(5)
    .nullish()
    .catch(undefined),
};

const trip = {
  destination: words(120),
  dateFrom: words(60),
  dateTo: words(60),
  month: words(60),
  flexible: flag,
  adults: whole,
  childrenAges: wholes,
  childrenCount: whole,
  budget: z
    .union([z.number(), z.string().transform(cut(80))])
    .nullish()
    .catch(undefined),
  budgetBasis: words(20),
  departureCity: words(120),
  tripType: words(30),
  hotelCategory: words(30),
  food: words(30),
  roomType: words(120),
};

export const leadAnswer = z.object({
  name: words(120),
  phone: words(40),
  phone2: words(40),
  email: words(120),
  instagram: words(60),
  ...trip,
  note: words(4000),
  ...common,
});
export const tripAnswer = z.object({ ...trip, ...common });
export const callAnswer = z.object({
  outcome: words(20),
  note: words(2000),
  followUpDay: words(60),
  followUpTime: words(60),
  followUpTitle: words(200),
  ...trip,
  ...common,
});
export const quoteAnswer = z.object({
  title: words(120),
  startDate: words(60),
  adults: whole,
  children: whole,
  days: lenient(z.array(z.object({ title: words(120), description: words(2000) })).max(60)),
  items: lenient(z.array(z.object({ description: words(200), detail: words(200), quantity: whole })).max(50)),
  inclusions: words(3000),
  exclusions: words(3000),
  notes: words(3000),
  ...common,
});

export type LeadAnswer = z.infer<typeof leadAnswer>;
export type TripAnswer = z.infer<typeof tripAnswer>;
export type CallAnswer = z.infer<typeof callAnswer>;
export type QuoteAnswer = z.infer<typeof quoteAnswer>;
