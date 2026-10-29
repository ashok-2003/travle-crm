"use client";

// Settings, AI: what the autopilot does beyond its words (the owner, 2026-10-29): notes on the lead when a chat tells
// something worth keeping, the agency's media when it helps, how customers pay (sent exactly as written when someone wants
// to book, then the payment screenshot is asked for), and the rules it always follows. Saved with the autopilot's form.
import type { SaveAutopilotInput } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Values = Pick<SaveAutopilotInput, "leadNotes" | "sendMedia" | "paymentDetails" | "strictRules">;

function SwitchRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-label text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

export function PaymentsCard({
  values,
  change,
  disabled,
}: {
  values: Values;
  change: (patch: Partial<Values>) => void;
  disabled: boolean;
}) {
  const t = useTranslations("ai.payments");
  const ids = { notes: useId(), media: useId(), payment: useId(), rules: useId() };
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <SwitchRow
          id={ids.notes}
          label={t("leadNotes")}
          hint={t("leadNotesHint")}
          checked={values.leadNotes}
          disabled={disabled}
          onChange={(leadNotes) => {
            change({ leadNotes });
          }}
        />
        <SwitchRow
          id={ids.media}
          label={t("sendMedia")}
          hint={t("sendMediaHint")}
          checked={values.sendMedia}
          disabled={disabled}
          onChange={(sendMedia) => {
            change({ sendMedia });
          }}
        />
        <Separator />
        <Field>
          <FieldLabel htmlFor={ids.payment}>{t("details")}</FieldLabel>
          <Textarea
            id={ids.payment}
            rows={6}
            maxLength={2000}
            value={values.paymentDetails}
            placeholder={t("detailsPlaceholder")}
            disabled={disabled}
            onChange={(event) => {
              change({ paymentDetails: event.target.value });
            }}
          />
          <FieldDescription>{t("detailsHint")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={ids.rules}>{t("rules")}</FieldLabel>
          <Textarea
            id={ids.rules}
            rows={6}
            maxLength={4000}
            value={values.strictRules}
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
