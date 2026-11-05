"use client";

// The words for an email's kind (its purpose) and for where it failed. A purpose the console has no word for yet shows
// as recorded.
import type { EmailFailureSource } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

const PURPOSES = ["notification", "password-reset", "staff-invite", "platform-incident", "other"] as const;
type KnownPurpose = (typeof PURPOSES)[number];

const isKnownPurpose = (purpose: string): purpose is KnownPurpose => (PURPOSES as readonly string[]).includes(purpose);

export function useEmailWords() {
  const t = useTranslations("consolePlatform.emails");
  const purpose = useCallback((value: string) => (isKnownPurpose(value) ? t(`purposes.${value}`) : value), [t]);
  const source = useCallback((value: EmailFailureSource) => t(`sources.${value}`), [t]);
  const sourceMeaning = useCallback((value: EmailFailureSource) => t(`sourceMeanings.${value}`), [t]);
  return { purpose, source, sourceMeaning };
}
