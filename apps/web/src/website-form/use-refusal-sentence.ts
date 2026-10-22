"use client";

// The sentence under the Send button for a refused or failed send (W41): the api's reason when the app has words for it,
// else one for too many tries, else the plain "something went wrong".
import { useTranslations } from "next-intl";
import errors from "@/i18n/messages/en-IN/errors.json";
import { FormRefusal } from "./refusal";

type Reason = keyof typeof errors.reasons;
const isReason = (value: string): value is Reason => Object.hasOwn(errors.reasons, value);

export function useRefusalSentence(): (error: unknown) => string {
  const t = useTranslations("websiteForm.form");
  const tErrors = useTranslations("errors");
  return (error) => {
    if (error instanceof FormRefusal) {
      if (error.reason !== null && isReason(error.reason)) return tErrors(`reasons.${error.reason}`);
      if (error.status === 429) return t("tooMany");
    }
    return t("wentWrong");
  };
}
