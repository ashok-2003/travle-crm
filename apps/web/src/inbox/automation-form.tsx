"use client";

// The automatic answers' settings on /settings/whatsapp (sales inbox spec 6), for the Owner and Admins: an away message sent
// outside the office's hours and days, and a welcome for a number writing for the first time. Saving is audited.
import type { InboxAutomation } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { TimeField } from "@/components/forms/time-field";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useWriteAccess } from "@/subscription/write-access";
import { useAutomationChanges } from "./use-sales-inbox";

const days = ["1", "2", "3", "4", "5", "6", "0"] as const;
const asTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const asMinutes = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

type Values = Omit<InboxAutomation, "openFrom" | "openUntil" | "openDays"> & {
  openFrom: string;
  openUntil: string;
  openDays: string[];
};

export function AutomationForm({ saved }: { saved: InboxAutomation }) {
  const t = useTranslations("inbox.automation");
  const access = useWriteAccess("change");
  const { save } = useAutomationChanges();
  const form = useForm<Values>({
    defaultValues: {
      ...saved,
      openFrom: asTime(saved.openFrom),
      openUntil: asTime(saved.openUntil === 1440 ? 1439 : saved.openUntil),
      openDays: saved.openDays.map(String),
    },
  });
  const awayOn = useWatch({ control: form.control, name: "awayEnabled" });
  const welcomeOn = useWatch({ control: form.control, name: "welcomeEnabled" });
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          save.mutate(
            {
              ...values,
              openFrom: asMinutes(values.openFrom),
              openUntil: asMinutes(values.openUntil),
              openDays: values.openDays.map(Number),
            },
            { onSuccess: () => toast.success(t("saved")) },
          );
        })(event);
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t("awayTitle")}</CardTitle>
          <CardDescription>{t("awayIntro")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Controller
            control={form.control}
            name="awayEnabled"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <Switch id="away-on" checked={field.value} onCheckedChange={field.onChange} />
                <Label htmlFor="away-on">{t("awayOn")}</Label>
              </div>
            )}
          />
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <TimeField control={form.control} name="openFrom" label={t("opens")} />
            <TimeField control={form.control} name="openUntil" label={t("closes")} />
          </div>
          <Controller
            control={form.control}
            name="openDays"
            render={({ field }) => (
              <div className="flex flex-col gap-2">
                <Label>{t("openDays")}</Label>
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  spacing={1}
                  className="flex-wrap"
                  value={field.value}
                  onValueChange={field.onChange}
                  aria-label={t("openDays")}
                >
                  {days.map((day) => (
                    <ToggleGroupItem key={day} value={day} className="rounded-full">
                      {t(`days.${day}`)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            )}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="away-message">{t("awayMessage")}</Label>
            <Textarea
              id="away-message"
              maxLength={1000}
              placeholder={t("awayPlaceholder")}
              disabled={!awayOn}
              {...form.register("awayMessage")}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("welcomeTitle")}</CardTitle>
          <CardDescription>{t("welcomeIntro")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Controller
            control={form.control}
            name="welcomeEnabled"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <Switch id="welcome-on" checked={field.value} onCheckedChange={field.onChange} />
                <Label htmlFor="welcome-on">{t("welcomeOn")}</Label>
              </div>
            )}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="welcome-message">{t("welcomeMessage")}</Label>
            <Textarea
              id="welcome-message"
              maxLength={1000}
              placeholder={t("welcomePlaceholder")}
              disabled={!welcomeOn}
              {...form.register("welcomeMessage")}
            />
          </div>
        </CardContent>
      </Card>
      <RefusalAlert error={save.error} />
      <Button type="submit" className="self-start" disabled={!access.allowed || save.isPending}>
        {t("save")}
      </Button>
    </form>
  );
}
