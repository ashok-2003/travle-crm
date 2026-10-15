"use client";

// Checking a form before it is sent, with the contracts' Zod schemas (the api's own rules), and saying every problem in
// our own words (ADR 0018). The generic problems Zod would phrase for developers come from the error map. The
// contracts word a few rules in English for the api's callers ("Use 3-12 letters or digits"), and Zod lets a schema's
// own message win over any error map, so those are replaced after the check, by field and kind of problem.
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { FieldError, FieldValues, Resolver } from "react-hook-form";
import type { z } from "zod";

type FieldMessages = ReturnType<typeof useTranslations<"account.fields">>;

function errorMapFor(t: FieldMessages): z.core.$ZodErrorMap {
  return (issue) => {
    if (issue.code === "too_small" && issue.origin === "string" && issue.minimum === 1) return t("required");
    if (issue.code === "invalid_format" && issue.format === "email") {
      return issue.input === "" ? t("required") : t("invalidEmail");
    }
    if (issue.code === "too_big" && issue.origin === "string") return t("tooLong");
    return undefined;
  };
}

/** Our words for a contracts rule a field failed (Zod's issue code is the problem), or null to keep the message. */
function ownWords(field: string, problem: string, value: unknown, t: FieldMessages): string | null {
  if (typeof value === "string" && value.trim() === "") return t("required");
  if (field === "orgCode" && problem === "invalid_format") return t("organizationCodeInvalid");
  if (field === "username" && problem === "invalid_format") return t("usernameInvalid");
  if (field === "newPassword" && problem === "too_small") return t("passwordTooShort");
  if (field === "email" && problem === "custom") return t("realEmail");
  return null;
}

function isFieldError(value: unknown): value is FieldError {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}

/** React Hook Form's resolver for a schema, with our words for every problem it finds. */
export function useFormResolver<Input extends FieldValues, Output>(
  schema: z.ZodType<Output, Input>,
): Resolver<Input, unknown, Output> {
  const t = useTranslations("account.fields");
  return useMemo(() => {
    const check = zodResolver(schema, { error: errorMapFor(t) });
    return async (values, context, options) => {
      const result = await check(values, context, options);
      // The forms' fields are all top-level, so each error is a plain FieldError.
      for (const [field, error] of Object.entries<unknown>(result.errors)) {
        if (!isFieldError(error)) continue;
        const words = ownWords(field, error.type, values[field], t);
        if (words !== null) error.message = words;
      }
      return result;
    };
  }, [schema, t]);
}
