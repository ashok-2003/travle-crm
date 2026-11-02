// The quote editor's form values as typed (quote-form.tsx), shared with the AI fill's converter (ai/fill/fill-converters.ts).
export interface QuoteFormValues {
  title: string;
  startDate: string;
  adults: string;
  children: string;
  days: { title: string; description: string }[];
  items: {
    description: string;
    detail: string;
    quantity: string;
    price: string;
    /** What the supplier charges for one, a rate's cost copied in; kept as it was read, never typed (release 7b). */
    costUnitPaise?: number | undefined;
    rateId?: string | undefined;
    /** A package line with no rate for these dates, at zero until priced. */
    needsRate?: boolean | undefined;
  }[];
  taxRate: string;
  /** A GST state code, "OUTSIDE_INDIA", or "own" for the agency's own state (a select can't hold an empty value). */
  placeOfSupply: string;
  inclusions: string;
  exclusions: string;
  notes: string;
}
