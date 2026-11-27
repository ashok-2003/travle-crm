// Whether each payment due is paid, due or overdue, and a booking's payment state: worked out once here, in the agency's today.
import type { CalendarDate } from "../kernel/index.js";
import { coveredInstallments } from "./totals.js";

export type DueState = "paid" | "due" | "overdue";
export type PaymentState = "paid" | "part_paid" | "nothing" | "overdue";

/** Covered by what was paid, earliest first, is paid; else before today is overdue (a due today is not yet); else due. */
export function dueStatesOf(
  installments: readonly { id: string; amountPaise: number; dueOn: string }[],
  paidPaise: number,
  today: CalendarDate,
): Map<string, DueState> {
  return new Map(
    coveredInstallments(installments, paidPaise).map((due) => [
      due.id,
      due.paid ? "paid" : due.dueOn < today ? "overdue" : "due",
    ]),
  );
}

/** Overdue wins over part paid and nothing; paid only when the balance is 0. */
export function paymentStateOf(booking: {
  paidPaise: number;
  balancePaise: number;
  anyOverdue: boolean;
}): PaymentState {
  if (booking.balancePaise === 0) return "paid";
  if (booking.anyOverdue) return "overdue";
  return booking.paidPaise === 0 ? "nothing" : "part_paid";
}
