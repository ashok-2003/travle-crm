"use client";

// The form's questions (spec 3.2, item 3): Name and Phone are always asked; each of the six others is Off, Optional or
// Required; and, once marketing consent is on (spec 0.1.2), the switch that asks for permission to send offers, with the
// sentence visitors will read under it.
import { features } from "@travel-crm/contracts/features";
import { offersWording } from "@travel-crm/contracts/website-forms";
import { useTranslations } from "next-intl";
import { Fragment, useId } from "react";
import { Controller, useWatch, type Control } from "react-hook-form";
import { ChoiceField } from "@/components/forms/choice-field";
import { TextLink } from "@/components/text-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { destinationInputs, fieldModes } from "@travel-crm/contracts/website-forms";
import { useMe } from "@/session/me-context";
import type { FormValues } from "./form-values";

type ModeField = "emailMode" | "destinationMode" | "travelMonthMode" | "travellersMode" | "budgetMode" | "messageMode";

const questions: readonly {
  name: ModeField;
  label: "email" | "destination" | "travelMonth" | "travellers" | "budget" | "message";
}[] = [
  { name: "emailMode", label: "email" },
  { name: "destinationMode", label: "destination" },
  { name: "travelMonthMode", label: "travelMonth" },
  { name: "travellersMode", label: "travellers" },
  { name: "budgetMode", label: "budget" },
  { name: "messageMode", label: "message" },
];

function ModeRow({ control, name, label }: { control: Control<FormValues>; name: ModeField; label: string }) {
  const t = useTranslations("websiteFormSettings.fields.modes");
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Item size="sm" role="listitem">
          <ItemContent>
            <ItemTitle>
              <Label htmlFor={id}>{label}</Label>
            </ItemTitle>
          </ItemContent>
          <ItemActions>
            <Select name={field.name} value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id={id} ref={field.ref} className="h-auto w-36" onBlur={field.onBlur}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {fieldModes.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {t(mode)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ItemActions>
        </Item>
      )}
    />
  );
}

/** How the Destination question appears: the agency's list or a box to type in, with a hint when the list would be empty. */
function DestinationInputRow({ control, hasDestinations }: { control: Control<FormValues>; hasDestinations: boolean }) {
  const t = useTranslations("websiteFormSettings.fields.destinationInput");
  const mode = useWatch({ control, name: "destinationMode" });
  const input = useWatch({ control, name: "destinationInput" });
  if (mode === "off") return null;
  return (
    <div role="listitem" className="flex flex-col gap-1 px-4 pb-2">
      <ChoiceField
        control={control}
        name="destinationInput"
        legend={t("legend")}
        options={destinationInputs.map((value) => ({ value, label: t(value) }))}
      />
      {input === "list" && !hasDestinations && (
        <p className="text-caption text-muted-foreground">
          {t.rich("noDestinations", {
            link: (chunks) => (
              <TextLink inline href="/settings/destinations">
                {chunks}
              </TextLink>
            ),
          })}
        </p>
      )}
    </div>
  );
}

function OffersRow({ control }: { control: Control<FormValues> }) {
  const t = useTranslations("websiteFormSettings.fields");
  const { name } = useMe().organization;
  const id = useId();
  return (
    <Controller
      control={control}
      name="offersTickbox"
      render={({ field }) => (
        <Item size="sm" role="listitem">
          <ItemContent>
            <ItemTitle>
              <Label htmlFor={id}>{t("offers")}</Label>
            </ItemTitle>
            <ItemDescription id={`${id}-hint`}>{t("offersHint", { wording: offersWording(name) })}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Switch id={id} aria-describedby={`${id}-hint`} checked={field.value} onCheckedChange={field.onChange} />
          </ItemActions>
        </Item>
      )}
    />
  );
}

export function FieldsCard({ control, hasDestinations }: { control: Control<FormValues>; hasDestinations: boolean }) {
  const t = useTranslations("websiteFormSettings.fields");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("heading")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ItemGroup aria-label={t("heading")}>
          {(["name", "phone"] as const).map((fixed) => (
            <Item key={fixed} size="sm" role="listitem">
              <ItemContent>
                <ItemTitle>{t(fixed)}</ItemTitle>
              </ItemContent>
              <ItemActions>
                <span className="text-label text-muted-foreground">{t("alwaysAsked")}</span>
              </ItemActions>
            </Item>
          ))}
          {questions.map((question) => (
            <Fragment key={question.name}>
              <ModeRow control={control} name={question.name} label={t(question.label)} />
              {question.name === "destinationMode" && (
                <DestinationInputRow control={control} hasDestinations={hasDestinations} />
              )}
            </Fragment>
          ))}
          {features.marketingConsent && <OffersRow control={control} />}
        </ItemGroup>
      </CardContent>
    </Card>
  );
}
