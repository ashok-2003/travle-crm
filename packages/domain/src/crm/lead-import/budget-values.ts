// A row's budget (spec B20): the amount in rupees and its basis, from the Budget basis cell or the file's answer. An
// amount or a basis we can't read is kept for the note, never guessed.
import { keyOfWord, type BudgetBasis, type BudgetInput } from "@travel-crm/contracts/crm";
import { readPaise } from "./row-values.js";

export interface BudgetReading {
  budget: BudgetInput | null;
  /** Lines for the lead's note, "Budget: lots", for what couldn't be read. */
  kept: string[];
}

export function readBudget(
  amountText: string | null,
  basisText: string | null,
  defaultBasis: BudgetBasis,
): BudgetReading {
  const kept: string[] = [];
  if (amountText === null) {
    if (basisText !== null && keyOfWord("budgetBasis", basisText) === null) kept.push(`Budget basis: ${basisText}`);
    return { budget: null, kept };
  }
  const paise = readPaise(amountText);
  if (paise === null) return { budget: null, kept: [`Budget: ${amountText}`] };
  const basisKey = basisText === null ? null : keyOfWord("budgetBasis", basisText);
  if (basisText !== null && basisKey === null) kept.push(`Budget basis: ${basisText}`);
  const basis: BudgetBasis = basisKey === "per_person" || basisKey === "for_everyone" ? basisKey : defaultBasis;
  return { budget: { amount: { amountPaise: paise, currency: "INR" }, basis }, kept };
}
