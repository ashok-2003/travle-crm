"use client";

// /settings/bookings (release 6): how the agency's bookings run. The payment schedule Confirm offers (the advance and the
// balance's day), what travellers fill in and when it locks, the reminders and the WhatsApp templates they use, what the trip
// page says (packing list, bank details, emergency contact, the review link), and the cancellation steps and notes that every
// new booking freezes at the start.
import {
  saveBookingSettingsInput,
  travellerLevels,
  type BookingSettingsView,
  type TravellerLevel,
} from "@travel-crm/contracts/bookings";
import type { TemplateField } from "@travel-crm/contracts/sales";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { BackToSettings } from "@/components/back-to-settings";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemGroup } from "@/components/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useSendableTemplates } from "@/inbox/use-templates";
import { TemplateBlanks } from "@/sales/template-blanks";
import { useWriteAccess } from "@/subscription/write-access";
import { useBookingSettings, useSaveBookingSettings } from "./use-bookings";

const tripFields: TemplateField[] = ["name", "link", "agent", "agency", "destination", "when"];
const paymentFields: TemplateField[] = ["name", "amount", "due", "link", "agent", "agency"];

const whole = (text: string, max: number) => Math.min(max, Number(text.replace(/\D/g, "")) || 0);

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function SettingsForm({ saved }: { saved: BookingSettingsView }) {
  const t = useTranslations("bookings.settings");
  const access = useWriteAccess("change");
  const save = useSaveBookingSettings();
  const templates = useSendableTemplates(true).data?.items ?? [];
  const [settings, setSettings] = useState<BookingSettingsView>(saved);
  const [reminderDays, setReminderDays] = useState(saved.balanceReminderDays.join(", "));
  const [problem, setProblem] = useState<string | null>(null);
  const busy = save.isPending || !access.allowed;
  const change = (patch: Partial<BookingSettingsView>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };
  const ids = {
    advance: useId(),
    balance: useId(),
    cutoff: useId(),
    level: useId(),
    reminders: useId(),
    details: useId(),
    packing: useId(),
    bank: useId(),
    emergencyName: useId(),
    emergencyPhone: useId(),
    review: useId(),
    notes: useId(),
  };

  const submit = () => {
    setProblem(null);
    const days = reminderDays
      .split(",")
      .map((day) => day.trim())
      .filter((day) => day !== "")
      .map(Number);
    if (days.some((day) => !Number.isInteger(day))) {
      setProblem(t("problems.reminderDays"));
      return;
    }
    const parsed = saveBookingSettingsInput.safeParse({ ...settings, balanceReminderDays: days });
    if (!parsed.success) {
      const rules = parsed.error.issues.some((issue) => issue.path[0] === "rules");
      setProblem(rules ? t("problems.rules") : t("problems.check"));
      return;
    }
    save.mutate(parsed.data, { onSuccess: () => toast.success(t("saved")) });
  };

  const rules = settings.rules;
  const setRule = (index: number, patch: Partial<(typeof rules)[number]>) => {
    change({ rules: rules.map((rule, at) => (at === index ? { ...rule, ...patch } : rule)) });
  };

  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <Section title={t("schedule.title")} description={t("schedule.description")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={ids.advance}>{t("schedule.advance")}</FieldLabel>
            <Input
              id={ids.advance}
              inputMode="numeric"
              className="numbers"
              value={String(settings.advanceBasisPoints / 100)}
              disabled={busy}
              onChange={(event) => {
                change({ advanceBasisPoints: whole(event.target.value, 100) * 100 });
              }}
            />
            <FieldDescription>{t("schedule.advanceHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.balance}>{t("schedule.balance")}</FieldLabel>
            <Input
              id={ids.balance}
              inputMode="numeric"
              className="numbers"
              value={String(settings.balanceDaysBefore)}
              disabled={busy}
              onChange={(event) => {
                change({ balanceDaysBefore: whole(event.target.value, 365) });
              }}
            />
            <FieldDescription>{t("schedule.balanceHint")}</FieldDescription>
          </Field>
        </div>
      </Section>

      <Section title={t("travellers.title")} description={t("travellers.description")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={ids.level}>{t("travellers.level")}</FieldLabel>
            <Select
              value={settings.defaultLevel}
              disabled={busy}
              onValueChange={(level) => {
                change({ defaultLevel: level as TravellerLevel });
              }}
            >
              <SelectTrigger id={ids.level} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {travellerLevels.map((one) => (
                  <SelectItem key={one} value={one}>
                    {t(`travellers.levels.${one}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.cutoff}>{t("travellers.cutoff")}</FieldLabel>
            <Input
              id={ids.cutoff}
              inputMode="numeric"
              className="numbers"
              value={String(settings.detailsCutoffDays)}
              disabled={busy}
              onChange={(event) => {
                change({ detailsCutoffDays: whole(event.target.value, 60) });
              }}
            />
            <FieldDescription>{t("travellers.cutoffHint")}</FieldDescription>
          </Field>
        </div>
      </Section>

      <Section title={t("reminders.title")} description={t("reminders.description")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={ids.reminders}>{t("reminders.balanceDays")}</FieldLabel>
            <Input
              id={ids.reminders}
              inputMode="numeric"
              className="numbers"
              value={reminderDays}
              disabled={busy}
              onChange={(event) => {
                setReminderDays(event.target.value);
              }}
            />
            <FieldDescription>{t("reminders.balanceDaysHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.details}>{t("reminders.detailsDays")}</FieldLabel>
            <Input
              id={ids.details}
              inputMode="numeric"
              className="numbers"
              value={String(settings.detailsReminderDays)}
              disabled={busy}
              onChange={(event) => {
                change({ detailsReminderDays: whole(event.target.value, 60) });
              }}
            />
            <FieldDescription>{t("reminders.detailsDaysHint")}</FieldDescription>
          </Field>
        </div>
        <TemplateBlanks
          label={t("reminders.balanceTemplate")}
          templates={templates}
          templateId={settings.balanceTemplateId}
          params={settings.balanceParams}
          fields={paymentFields}
          disabled={busy}
          onChange={(templateId, params) => {
            change({ balanceTemplateId: templateId, balanceParams: params });
          }}
        />
        <TemplateBlanks
          label={t("reminders.detailsTemplate")}
          templates={templates}
          templateId={settings.detailsTemplateId}
          params={settings.detailsParams}
          fields={tripFields}
          disabled={busy}
          onChange={(templateId, params) => {
            change({ detailsTemplateId: templateId, detailsParams: params });
          }}
        />
        <TemplateBlanks
          label={t("reminders.reportingTemplate")}
          templates={templates}
          templateId={settings.reportingTemplateId}
          params={settings.reportingParams}
          fields={tripFields}
          disabled={busy}
          onChange={(templateId, params) => {
            change({ reportingTemplateId: templateId, reportingParams: params });
          }}
        />
        <TemplateBlanks
          label={t("reminders.feedbackTemplate")}
          templates={templates}
          templateId={settings.feedbackTemplateId}
          params={settings.feedbackParams}
          fields={tripFields}
          disabled={busy}
          onChange={(templateId, params) => {
            change({ feedbackTemplateId: templateId, feedbackParams: params });
          }}
        />
        <p className="text-caption text-muted-foreground">{t("reminders.consentHint")}</p>
      </Section>

      <Section title={t("page.title")} description={t("page.description")}>
        <Field>
          <FieldLabel htmlFor={ids.packing}>{t("page.packing")}</FieldLabel>
          <Textarea
            id={ids.packing}
            rows={4}
            value={settings.packingList}
            disabled={busy}
            onChange={(event) => {
              change({ packingList: event.target.value });
            }}
          />
          <FieldDescription>{t("page.packingHint")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={ids.bank}>{t("page.bank")}</FieldLabel>
          <Textarea
            id={ids.bank}
            rows={3}
            value={settings.bankDetails}
            disabled={busy}
            onChange={(event) => {
              change({ bankDetails: event.target.value });
            }}
          />
          <FieldDescription>{t("page.bankHint")}</FieldDescription>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={ids.emergencyName}>{t("page.emergencyName")}</FieldLabel>
            <Input
              id={ids.emergencyName}
              value={settings.emergencyName}
              disabled={busy}
              onChange={(event) => {
                change({ emergencyName: event.target.value });
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.emergencyPhone}>{t("page.emergencyPhone")}</FieldLabel>
            <Input
              id={ids.emergencyPhone}
              type="tel"
              value={settings.emergencyPhone}
              disabled={busy}
              onChange={(event) => {
                change({ emergencyPhone: event.target.value });
              }}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor={ids.review}>{t("page.review")}</FieldLabel>
          <Input
            id={ids.review}
            type="url"
            value={settings.googleReviewUrl}
            disabled={busy}
            onChange={(event) => {
              change({ googleReviewUrl: event.target.value });
            }}
          />
          <FieldDescription>{t("page.reviewHint")}</FieldDescription>
        </Field>
      </Section>

      <Section title={t("policy.title")} description={t("policy.description")}>
        <ItemGroup className="gap-3">
          {rules.map((rule, index) => (
            <Item key={index} variant="muted" className="items-end">
              <ItemContent className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${ids.notes}-days-${String(index)}`}>
                    {t("policy.days", { number: index + 1 })}
                  </FieldLabel>
                  <Input
                    id={`${ids.notes}-days-${String(index)}`}
                    inputMode="numeric"
                    className="numbers"
                    value={String(rule.daysBeforeMin)}
                    disabled={busy}
                    onChange={(event) => {
                      setRule(index, { daysBeforeMin: whole(event.target.value, 3650) });
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${ids.notes}-charge-${String(index)}`}>
                    {t("policy.charge", { number: index + 1 })}
                  </FieldLabel>
                  <Input
                    id={`${ids.notes}-charge-${String(index)}`}
                    inputMode="numeric"
                    className="numbers"
                    value={String(rule.chargeBasisPoints / 100)}
                    disabled={busy}
                    onChange={(event) => {
                      setRule(index, { chargeBasisPoints: whole(event.target.value, 100) * 100 });
                    }}
                  />
                </Field>
              </ItemContent>
              {rules.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("policy.remove", { number: index + 1 })}
                  disabled={busy}
                  onClick={() => {
                    change({ rules: rules.filter((_, at) => at !== index) });
                  }}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              )}
            </Item>
          ))}
        </ItemGroup>
        {rules.length < 12 && (
          <Button
            variant="outline"
            className="self-start"
            disabled={busy}
            onClick={() => {
              const next = Math.max(0, ...rules.map((rule) => rule.daysBeforeMin)) + 15;
              change({ rules: [...rules, { daysBeforeMin: Math.min(next, 3650), chargeBasisPoints: 0 }] });
            }}
          >
            <PlusIcon aria-hidden="true" />
            {t("policy.add")}
          </Button>
        )}
        <Field>
          <FieldLabel htmlFor={ids.notes}>{t("policy.notes")}</FieldLabel>
          <Textarea
            id={ids.notes}
            rows={3}
            value={settings.cancellationNotes}
            disabled={busy}
            onChange={(event) => {
              change({ cancellationNotes: event.target.value });
            }}
          />
          <FieldDescription>{t("policy.notesHint")}</FieldDescription>
        </Field>
      </Section>

      {problem !== null && <p className="text-status-bad-ink">{problem}</p>}
      <RefusalAlert error={save.error} />
      <Button className="self-start" size="lg" disabled={busy} onClick={submit}>
        {save.isPending && <Spinner aria-hidden="true" />}
        {save.isPending ? t("saving") : t("save")}
      </Button>
    </div>
  );
}

export function BookingSettingsScreen() {
  const t = useTranslations("bookings.settings");
  const tCommon = useTranslations("common");
  const settings = useBookingSettings();
  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} />
      {settings.data ? (
        <SettingsForm saved={settings.data} />
      ) : settings.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={settings.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void settings.refetch()}
        />
      ) : (
        <LoadingRows shape="twoLines" label={t("loading")} />
      )}
    </div>
  );
}
