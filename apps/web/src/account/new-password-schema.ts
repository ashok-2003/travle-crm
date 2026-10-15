"use client";

// A new password typed twice, as both changing a password and choosing one from a reset link ask for it: the
// contracts' rule for a new password, and the two copies the same.
import { newPassword } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { z } from "zod";

/** Read loosely: Zod can't name the fields of an object built from a generic shape. */
function sameTwice(values: object): boolean {
  return "newPassword" in values && "confirmPassword" in values && values.newPassword === values.confirmPassword;
}

/** The form's schema: its other fields, then the new password twice. Keep otherFields at module level: one schema. */
export function useNewPasswordSchema<Shape extends z.ZodRawShape>(otherFields: Shape) {
  const t = useTranslations("account.fields");
  return useMemo(
    () =>
      z
        .strictObject({ ...otherFields, newPassword, confirmPassword: z.string() })
        .refine(sameTwice, { message: t("passwordsDiffer"), path: ["confirmPassword"] }),
    [otherFields, t],
  );
}
