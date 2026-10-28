// The agency's running costs (step 6, P0): salaries, rent, ads, software, by the day they were spent. Voided, never
// deleted, when entered by mistake; every change audited.
import {
  expenseList,
  type AddExpenseInput,
  type Expense,
  type FinancePeriodInput,
} from "@travel-crm/contracts/finance";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

export async function listExpenses(tx: OrgTx, period: FinancePeriodInput): Promise<Expense[]> {
  const rows = await tx.agencyExpense.findMany({
    where: { voidedAt: null, spentOn: { gte: asDate(period.from), lte: asDate(period.to) } },
    orderBy: [{ spentOn: "desc" }, { createdAt: "desc" }],
    take: 500,
    select: { id: true, category: true, description: true, amountPaise: true, spentOn: true, note: true },
  });
  return expenseList.parse(
    rows.map((row) => ({
      ...row,
      amountPaise: Number(row.amountPaise),
      spentOn: row.spentOn.toISOString().slice(0, 10),
    })),
  );
}

export async function addExpense(tx: OrgTx, access: MemberAccess, input: AddExpenseInput): Promise<void> {
  const row = await tx.agencyExpense.create({
    data: {
      category: input.category,
      description: input.description,
      amountPaise: BigInt(input.amountPaise),
      spentOn: asDate(input.spentOn),
      note: input.note,
      createdBy: access.userId,
    },
    select: { id: true },
  });
  await recordAudit(tx, access, {
    action: "agency-expense.added",
    entityType: "agency_expense",
    entityId: row.id,
    after: { category: input.category, amountPaise: input.amountPaise, spentOn: input.spentOn },
  });
}

export async function voidExpense(tx: OrgTx, access: MemberAccess, expenseId: string, now: Date): Promise<void> {
  const row = await tx.agencyExpense.findUnique({
    where: { id: expenseId },
    select: { id: true, amountPaise: true, voidedAt: true },
  });
  if (row?.voidedAt !== null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  await tx.agencyExpense.update({ where: { id: row.id }, data: { voidedAt: now, voidedBy: access.userId } });
  await recordAudit(tx, access, {
    action: "agency-expense.voided",
    entityType: "agency_expense",
    entityId: row.id,
    before: { amountPaise: Number(row.amountPaise) },
  });
}
