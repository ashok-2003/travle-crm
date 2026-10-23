"use client";

// Working hours and the reply time (release 4, spec 3.1): the days the agency answers, when it opens and closes in its
// time zone, and how long a new lead may wait, in working time, before everyone who can assign leads is told. Both
// apply in every mode.
import { useTranslations } from "next-intl";
import type { Control } from "react-hook-form";
import { SelectField } from "@/components/forms/select-field";
import { TimeField } from "@/components/forms/time-field";
import { TextLink } from "@/components/text-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldLabel, FieldSet } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { routes } from "@/lib/routes";
import { dayBit, OFF, weekdays, type AssignmentValues } from "./assignment-values";

/** The waits offered, in minutes; one set elsewhere (the api takes 1 to 1440) still shows as itself. */
const slowReplyChoices = [15, 30, 60, 120, 240] as const;

export function HoursCard({
  control,
  workdays,
  onWorkdays,
  slowReply,
  timeZone,
}: {
  control: Control<AssignmentValues>;
  workdays: number;
  onWorkdays: (workdays: number) => void;
  /** The wait now chosen, so a value set elsewhere is offered too. */
  slowReply: string;
  timeZone: string;
}) {
  const t = useTranslations("settings.assignment");
  const minutes = [...new Set([...slowReplyChoices, ...(slowReply === OFF ? [] : [Number(slowReply)])])];
  const pressed = weekdays.filter((day) => (workdays & dayBit(day)) !== 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("hours.label")}</CardTitle>
        <CardDescription>{t("hours.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FieldSet>
          <FieldLabel asChild>
            <legend id="days-legend">{t("hours.days")}</legend>
          </FieldLabel>
          <ToggleGroup
            type="multiple"
            variant="outline"
            aria-labelledby="days-legend"
            value={pressed}
            onValueChange={(days) => {
              onWorkdays(weekdays.filter((day) => days.includes(day)).reduce((bits, day) => bits | dayBit(day), 0));
            }}
            className="flex-wrap"
          >
            {weekdays.map((day) => (
              <ToggleGroupItem
                key={day}
                value={day}
                aria-label={t(`hours.dayFull.${day}`)}
                className="min-h-11 min-w-11"
              >
                {t(`hours.dayNames.${day}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {workdays === 0 && <p className="text-label text-muted-foreground">{t("hours.noDays")}</p>}
        </FieldSet>
        <div className="grid gap-4 sm:grid-cols-2">
          <TimeField control={control} name="opens" label={t("hours.opens")} />
          <TimeField control={control} name="closes" label={t("hours.closes")} />
        </div>
        <p className="text-label text-muted-foreground">
          {t("hours.zone", { zone: timeZone })}{" "}
          <TextLink href={routes.profile} inline>
            {t("hours.zoneLink")}
          </TextLink>
        </p>
        <SelectField
          control={control}
          name="slowReply"
          label={t("slowReply.label")}
          hint={t("slowReply.hint")}
          options={[
            { value: OFF, label: t("slowReply.off") },
            ...minutes.map((each) => ({
              value: String(each),
              label:
                each % 60 === 0
                  ? t("slowReply.hours", { hours: each / 60 })
                  : t("slowReply.minutes", { minutes: each }),
            })),
          ]}
        />
      </CardContent>
    </Card>
  );
}
