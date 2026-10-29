"use client";

// Payments and strict rules (the owner, 2026-10-29): how customers pay (UPI ID, bank account, a payment link), which
// the AI sends exactly as written when someone wants to book, then asks for the payment screenshot; and the rules it
// always follows, whatever else it is told. Saved with the rest of the agent's settings.
import type { AiSettings, SaveAiSettingsInput } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

export function PaymentsCard({
  settings,
  change,
  disabled,
}: {
  settings: AiSettings;
  change: (patch: Partial<SaveAiSettingsInput>) => void;
  disabled: boolean;
}) {
  const t = useTranslations("ai.payments");
  const ids = { payment: useId(), rules: useId() };
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Field>
          <FieldLabel htmlFor={ids.payment}>{t("details")}</FieldLabel>
          <Textarea
            id={ids.payment}
            rows={6}
            maxLength={2000}
            value={settings.paymentDetails}
            placeholder={t("detailsPlaceholder")}
            disabled={disabled}
            onChange={(event) => {
              change({ paymentDetails: event.target.value });
            }}
          />
          <FieldDescription>{t("detailsHint")}</FieldDescription>
        </Field>
        <Separator />
        <Field>
          <FieldLabel htmlFor={ids.rules}>{t("rules")}</FieldLabel>
          <Textarea
            id={ids.rules}
            rows={6}
            maxLength={4000}
            value={settings.strictRules}
            placeholder={t("rulesPlaceholder")}
            disabled={disabled}
            onChange={(event) => {
              change({ strictRules: event.target.value });
            }}
          />
          <FieldDescription>{t("rulesHint")}</FieldDescription>
        </Field>
      </CardContent>
    </Card>
  );
}
