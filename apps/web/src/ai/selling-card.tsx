"use client";

// How the AI sales agent sells (the owner, 2026-10-28): whether it answers every chat by itself, when it steps back for
// a person (never by itself and flags the team, when the customer asks, or carefully), its follow-ups (timed by itself
// or after fixed hours, always inside WhatsApp's window), a day's limit per chat, lead scoring, notes on leads, sending
// the agency's media, and learning from the chats.
import { aiHandoffPolicies, type AiSettings, type SaveAiSettingsInput } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { ChoiceGroup } from "@/components/forms/choice-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

export function SwitchRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: ReactNode;
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-caption text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

const numberOf = (text: string, max: number) => Math.min(max, Number(text.replace(/\D/g, "")) || 0);

export function SellingCard({
  settings,
  change,
  disabled,
}: {
  settings: AiSettings;
  change: (patch: Partial<SaveAiSettingsInput>) => void;
  disabled: boolean;
}) {
  const t = useTranslations("ai.selling");
  const ids = { hours: useId(), limit: useId() };
  const followingUp = settings.followUpHours > 0;
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
          label={t("autopilot")}
          hint={t("autopilotHint")}
          checked={settings.autopilot}
          disabled={disabled}
          onChange={(autopilot) => {
            change({ autopilot });
          }}
        />
        <Separator />
        <ChoiceGroup
          legend={t("handoff")}
          value={settings.handoff}
          options={aiHandoffPolicies.map((policy) => ({
            value: policy,
            label: t(`handoffs.${policy}.label`),
            description: t(`handoffs.${policy}.description`),
          }))}
          onChange={(chosen) => {
            const handoff = aiHandoffPolicies.find((one) => one === chosen);
            if (handoff !== undefined) change({ handoff });
          }}
        />
        <Separator />
        <SwitchRow
          label={t("followUps")}
          hint={t("followUpsHint")}
          checked={followingUp}
          disabled={disabled}
          onChange={(on) => {
            change({ followUpHours: on ? 4 : 0 });
          }}
        />
        {followingUp && (
          <div className="flex flex-col gap-4 ps-12">
            <SwitchRow
              label={t("smartFollowUp")}
              hint={t("smartFollowUpHint")}
              checked={settings.smartFollowUp}
              disabled={disabled}
              onChange={(smartFollowUp) => {
                change({ smartFollowUp });
              }}
            />
            {!settings.smartFollowUp && (
              <Field>
                <FieldLabel htmlFor={ids.hours}>{t("followUpHours")}</FieldLabel>
                <Input
                  id={ids.hours}
                  inputMode="numeric"
                  className="max-w-60"
                  value={String(settings.followUpHours)}
                  disabled={disabled}
                  onChange={(event) => {
                    change({ followUpHours: Math.max(1, numberOf(event.target.value, 23)) });
                  }}
                />
                <FieldDescription>{t("followUpHoursHint")}</FieldDescription>
              </Field>
            )}
          </div>
        )}
        <Separator />
        <SwitchRow
          label={t("scoring")}
          hint={t("scoringHint")}
          checked={settings.scoring}
          disabled={disabled}
          onChange={(scoring) => {
            change({ scoring });
          }}
        />
        <SwitchRow
          label={t("leadNotes")}
          hint={t("leadNotesHint")}
          checked={settings.leadNotes}
          disabled={disabled}
          onChange={(leadNotes) => {
            change({ leadNotes });
          }}
        />
        <SwitchRow
          label={t("sendMedia")}
          hint={t("sendMediaHint")}
          checked={settings.sendMedia}
          disabled={disabled}
          onChange={(sendMedia) => {
            change({ sendMedia });
          }}
        />
        <SwitchRow
          label={t("learning")}
          hint={t("learningHint")}
          checked={settings.learning}
          disabled={disabled}
          onChange={(learning) => {
            change({ learning });
          }}
        />
        <Field>
          <FieldLabel htmlFor={ids.limit}>{t("maxReplies")}</FieldLabel>
          <Input
            id={ids.limit}
            inputMode="numeric"
            className="max-w-60"
            value={String(settings.maxRepliesPerDay)}
            disabled={disabled}
            onChange={(event) => {
              change({ maxRepliesPerDay: numberOf(event.target.value, 200) });
            }}
          />
          <FieldDescription>{t("maxRepliesHint")}</FieldDescription>
        </Field>
      </CardContent>
    </Card>
  );
}
