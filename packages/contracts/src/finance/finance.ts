// Finance (step 6, P0): what each booking (an accepted quote) costs the agency (hotels, cabs, flights, paid to suppliers,
// or still owed), the agency's own running costs (salaries, rent, ads), and what is left: each booking's profit and the
// agency's over a period. Amounts are integer paise; revenue is before GST, which belongs to the government.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/index.js";
import { MAX_QUOTE_PAISE } from "../quotes/quotes.js";

const positivePaise = z.int().min(1).max(MAX_QUOTE_PAISE);
const text = (max: number) => z.string().trim().max(max);

export const tripCostCategories = [
  "hotel",
  "transport",
  "flight",
  "train",
  "activity",
  "visa",
  "guide",
  "other",
] as const;
export const tripCostCategory = z.enum(tripCostCategories);
export type TripCostCategory = z.infer<typeof tripCostCategory>;

export const expenseCategories = [
  "salary",
  "rent",
  "marketing",
  "software",
  "utilities",
  "commission",
  "travel",
  "other",
] as const;
export const expenseCategory = z.enum(expenseCategories);
export type ExpenseCategory = z.infer<typeof expenseCategory>;

export const addTripCostInput = z.strictObject({
  quoteId: recordId,
  category: tripCostCategory,
  supplier: text(120).min(1),
  amountPaise: positivePaise,
  /** When the supplier is to be paid; null when it isn't known. */
  dueOn: calendarDate.nullable(),
  /** The day it was paid; null while it is owed. */
  paidOn: calendarDate.nullable(),
  note: text(300),
});
export type AddTripCostInput = z.infer<typeof addTripCostInput>;
export const tripCostIdInput = z.strictObject({ tripCostId: recordId });
export const markTripCostPaidInput = z.strictObject({ tripCostId: recordId, paidOn: calendarDate });
export type MarkTripCostPaidInput = z.infer<typeof markTripCostPaidInput>;
export const quoteCostsInput = z.strictObject({ quoteId: recordId });

export const tripCost = z.object({
  id: recordId,
  category: tripCostCategory,
  supplier: z.string(),
  amountPaise: z.int(),
  dueOn: calendarDate.nullable(),
  paidOn: calendarDate.nullable(),
  note: z.string(),
});
export type TripCost = z.infer<typeof tripCost>;

/** A booking's costs and what is left of its price once they are paid. */
export const bookingCosts = z.object({
  costs: z.array(tripCost),
  /** The price before GST: the agency's own revenue. */
  revenuePaise: z.int(),
  costPaise: z.int(),
  profitPaise: z.int(),
  /** Profit as hundredths of a percent of revenue; null without revenue. */
  marginBasisPoints: z.int().nullable(),
});
export type BookingCosts = z.infer<typeof bookingCosts>;

export const addExpenseInput = z.strictObject({
  category: expenseCategory,
  description: text(200).min(1),
  amountPaise: positivePaise,
  spentOn: calendarDate,
  note: text(300),
});
export type AddExpenseInput = z.infer<typeof addExpenseInput>;
export const expenseIdInput = z.strictObject({ expenseId: recordId });

export const expense = z.object({
  id: recordId,
  category: expenseCategory,
  description: z.string(),
  amountPaise: z.int(),
  spentOn: calendarDate,
  note: z.string(),
});
export type Expense = z.infer<typeof expense>;

export const financePeriodInput = z.strictObject({ from: calendarDate, to: calendarDate });
export type FinancePeriodInput = z.infer<typeof financePeriodInput>;

export const financeSummary = z.object({
  /** Bookings accepted in the period: their count and their price before GST. */
  bookings: z.int(),
  revenuePaise: z.int(),
  /** The GST on those bookings, owed to the government. */
  gstPaise: z.int(),
  /** What those bookings cost (hotels, cabs...), paid or owed. */
  tripCostPaise: z.int(),
  grossProfitPaise: z.int(),
  /** The agency's running costs spent in the period. */
  expensePaise: z.int(),
  netProfitPaise: z.int(),
  /** Money customers paid in the period. */
  collectedPaise: z.int(),
  /** Now: what customers still owe on accepted quotes, and what the agency still owes suppliers. */
  receivablePaise: z.int(),
  payablePaise: z.int(),
  /** The period's running costs by category, the largest first. */
  expensesByCategory: z.array(z.object({ category: expenseCategory, amountPaise: z.int() })),
  /** Six months to the period's end: revenue, costs and profit a month. */
  months: z.array(
    z.object({
      month: z.string(),
      revenuePaise: z.int(),
      tripCostPaise: z.int(),
      expensePaise: z.int(),
      netProfitPaise: z.int(),
    }),
  ),
});
export type FinanceSummary = z.infer<typeof financeSummary>;

export const bookingRow = z.object({
  quoteId: recordId,
  leadId: recordId,
  customerName: z.string(),
  title: z.string(),
  startDate: calendarDate.nullable(),
  acceptedOn: calendarDate.nullable(),
  revenuePaise: z.int(),
  totalPaise: z.int(),
  paidPaise: z.int(),
  balancePaise: z.int(),
  costPaise: z.int(),
  /** Costs not yet paid to suppliers. */
  owedPaise: z.int(),
  profitPaise: z.int(),
  marginBasisPoints: z.int().nullable(),
});
export type BookingRow = z.infer<typeof bookingRow>;
export const bookingList = z.array(bookingRow);
export const expenseList = z.array(expense);
