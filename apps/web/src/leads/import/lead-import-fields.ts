"use client";

// The lead file's fields with their words, in the order the column Select offers them (spec B8), and the stages a
// file's rows may default to or be matched to.
import {
  leadImportField,
  leadImportFields,
  leadStages,
  type LeadImportField,
  type LeadStage,
} from "@travel-crm/contracts/crm";
import type { ImportField } from "@travel-crm/contracts/imports";
import { useTranslations } from "next-intl";

export function useLeadFieldOptions(): { field: ImportField; label: string }[] {
  const t = useTranslations("imports.fields.leads");
  return leadImportFields.map((field) => ({ field, label: t(field) }));
}

/** The stages a value may be matched to: all of them; Not a lead is left out of the import by its own reason. */
export const matchableStages: readonly LeadStage[] = leadStages;

/** A column's field as a lead file's: a lead import's columns hold no staff-only field (username, role). */
export function leadFieldOf(field: ImportField | null): LeadImportField | null {
  const parsed = leadImportField.safeParse(field);
  return parsed.success ? parsed.data : null;
}
