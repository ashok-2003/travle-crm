"use client";

// How the AI sales agent speaks (the owner, 2026-10-28): the name it signs as, the language (the customer's own, or
// one the agency picks), how it lays a message out, how many emojis, its tone, and the agency's own instructions, with
// ready lines a click adds to them.
import {
  aiEmojiLevels,
  aiLanguages,
  aiStyles,
  aiTones,
  type AiSettings,
  type SaveAiSettingsInput,
} from "@travel-crm/contracts/ai";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const suggestionKeys = [
  "dates",
  "pickup",
  "twoOptions",
  "honeymoon",
  "advance",
  "noDiscount",
  "budget",
  "itinerary",
] as const;

/** One choice among a few, as chips: the registry ToggleGroup, one always chosen. */
function Chips<T extends string>({
  label,
  hint,
  values,
  value,
  words,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  values: readonly T[];
  value: T;
  words: (value: T) => string;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel id={id}>{label}</FieldLabel>
      <ToggleGroup
        type="single"
        variant="outline"
        aria-labelledby={id}
        value={value}
        disabled={disabled}
        className="flex-wrap"
        onValueChange={(chosen) => {
          const next = values.find((one) => one === chosen);
          if (next !== undefined) onChange(next);
        }}
      >
        {values.map((one) => (
          <ToggleGroupItem key={one} value={one} className="px-3">
            {words(one)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {hint !== undefined && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}

export function PersonalityCard({
  settings,
  change,
  disabled,
}: {
  settings: AiSettings;
  change: (patch: Partial<SaveAiSettingsInput>) => void;
  disabled: boolean;
}) {
  const t = useTranslations("ai.personality");
  const ids = { name: useId(), other: useId(), instructions: useId() };
  const add = (line: string) => {
    const current = settings.instructions.trim();
    if (current.includes(line)) return;
    change({ instructions: current === "" ? line : `${current}\n${line}` });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Field>
          <FieldLabel htmlFor={ids.name}>{t("name")}</FieldLabel>
          <Input
            id={ids.name}
            value={settings.agentName}
            maxLength={80}
            placeholder={t("namePlaceholder")}
            disabled={disabled}
            onChange={(event) => {
              change({ agentName: event.target.value });
            }}
          />
          <FieldDescription>{t("nameHint")}</FieldDescription>
        </Field>
        <Chips
          label={t("language")}
          values={aiLanguages}
          value={settings.language}
          words={(one) => t(`languages.${one}`)}
          disabled={disabled}
          onChange={(language) => {
            change({ language });
          }}
        />
        {settings.language === "other" && (
          <Field>
            <FieldLabel htmlFor={ids.other}>{t("languageOther")}</FieldLabel>
            <Input
              id={ids.other}
              value={settings.languageOther}
              maxLength={40}
              placeholder={t("languageOtherPlaceholder")}
              disabled={disabled}
              onChange={(event) => {
                change({ languageOther: event.target.value });
              }}
            />
          </Field>
        )}
        <Chips
          label={t("style")}
          hint={t(`styleHints.${settings.style}`)}
          values={aiStyles}
          value={settings.style}
          words={(one) => t(`styles.${one}`)}
          disabled={disabled}
          onChange={(style) => {
            change({ style });
          }}
        />
        <div className="grid gap-6 sm:grid-cols-2">
          <Chips
            label={t("emojis")}
            values={aiEmojiLevels}
            value={settings.emojis}
            words={(one) => t(`emojiLevels.${one}`)}
            disabled={disabled}
            onChange={(emojis) => {
              change({ emojis });
            }}
          />
          <Chips
            label={t("tone")}
            values={aiTones}
            value={settings.tone}
            words={(one) => t(`tones.${one}`)}
            disabled={disabled}
            onChange={(tone) => {
              change({ tone });
            }}
          />
        </div>
        <Field>
          <FieldLabel htmlFor={ids.instructions}>{t("instructions")}</FieldLabel>
          <Textarea
            id={ids.instructions}
            rows={6}
            maxLength={4000}
            value={settings.instructions}
            placeholder={t("instructionsPlaceholder")}
            disabled={disabled}
            onChange={(event) => {
              change({ instructions: event.target.value });
            }}
          />
          <FieldDescription>{t("instructionsHint")}</FieldDescription>
          <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label={t("suggestions")}>
            {suggestionKeys.map((key) => (
              <Button
                key={key}
                type="button"
                variant="secondary"
                size="sm"
                className="h-auto min-h-9 max-w-full justify-start rounded-full py-1.5 text-left whitespace-normal"
                disabled={disabled || settings.instructions.includes(t(`suggestion.${key}`))}
                onClick={() => {
                  add(t(`suggestion.${key}`));
                }}
              >
                <PlusIcon aria-hidden="true" />
                {t(`suggestion.${key}`)}
              </Button>
            ))}
          </div>
        </Field>
      </CardContent>
    </Card>
  );
}
