"use client";

// Messages for the checks a form runs before sending (the same Zod schemas the api uses). A schema's own message
// ("Use 3-12 letters or digits") wins; this covers the generic ones Zod would otherwise phrase for developers.
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { z } from "zod";

export function useFieldErrorMessages(): z.core.$ZodErrorMap {
  const t = useTranslations("account.fields");
  return useMemo<z.core.$ZodErrorMap>(
    () => (issue) => {
      if (issue.code === "too_small" && issue.origin === "string" && issue.minimum === 1) return t("required");
      if (issue.code === "invalid_format" && issue.format === "email") {
        return issue.input === "" ? t("required") : t("invalidEmail");
      }
      if (issue.code === "too_big" && issue.origin === "string") return t("tooLong");
      return undefined;
    },
    [t],
  );
}
