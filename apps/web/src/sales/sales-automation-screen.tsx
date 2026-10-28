"use client";

// /settings/sales-automation (sales execution): what the agency's sales do by themselves. The first WhatsApp to a lead that
// arrives by itself, within a minute; the follow-ups when it goes quiet (Day 1, 3, 7), which stop when the customer writes;
// the payment reminders; and what makes a lead hot (buying words, a trip soon, a big budget). Each WhatsApp is one of the
// agency's approved templates, its blanks filled for each lead.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import {
  MAX_FOLLOW_STEPS,
  saveSalesAutomationInput,
  type SalesAutomation,
  type TemplateField,
} from "@travel-crm/contracts/sales";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BackToSettings } from "@/components/back-to-settings";
import { ErrorState } from "@/components/error-state";
import { rupeesFieldText } from "@/components/forms/money-field";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemGroup } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useSendableTemplates } from "@/inbox/use-templates";
import { useWriteAccess } from "@/subscription/write-access";
import { TemplateBlanks } from "./template-blanks";
import { useSaveSalesAutomation, useSalesAutomation } from "./use-sales";

const leadFields: TemplateField[] = ["name", "destination", "when", "agent", "agency"];
const paymentFields: TemplateField[] = ["name", "amount", "due", "link", "agent", "agency"];

function Section({
  title,
  description,
  on,
  onToggle,
  toggleLabel,
  disabled,
  children,
}: {
  title: string;
  description: string;
  on?: boolean;
  onToggle?: (on: boolean) => void;
  toggleLabel?: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
        {onToggle !== undefined && (
          <CardAction>
            <div className="flex min-h-11 items-center gap-2">
              <Switch id={id} checked={on === true} onCheckedChange={onToggle} disabled={disabled} />
              <Label htmlFor={id}>{toggleLabel}</Label>
            </div>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function AutomationForm({ saved }: { saved: SalesAutomation }) {
  const t = useTranslations("sales.settings");
  const access = useWriteAccess("change");
  const save = useSaveSalesAutomation();
  const templates = useSendableTemplates(true).data?.items ?? [];
  const [settings, setSettings] = useState<SalesAutomation>(saved);
  const [keywords, setKeywords] = useState(saved.hotKeywords.join(", "));
  const [budget, setBudget] = useState(saved.hotBudgetPaise === null ? "" : rupeesFieldText(saved.hotBudgetPaise));
  const [problem, setProblem] = useState<string | null>(null);
  const busy = save.isPending || !access.allowed;
  const change = (patch: Partial<SalesAutomation>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };
  const ids = { days: useId(), travel: useId(), keywords: useId(), budget: useId() };

  const submit = () => {
    setProblem(null);
    const budgetPaise = budget.trim() === "" ? null : paiseFromRupeesText(budget);
    if (budget.trim() !== "" && budgetPaise === null) {
      setProblem(t("problems.budget"));
      return;
    }
    const parsed = saveSalesAutomationInput.safeParse({
      ...settings,
      hotKeywords: keywords
        .split(",")
        .map((word) => word.trim())
        .filter((word) => word !== ""),
      hotBudgetPaise: budgetPaise,
    });
    if (!parsed.success) {
      setProblem(t("problems.check"));
      return;
    }
    save.mutate(parsed.data, { onSuccess: () => toast.success(t("saved")) });
  };

  const steps = settings.followSteps;
  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <Section
        title={t("speed.title")}
        description={t("speed.description")}
        on={settings.speedEnabled}
        onToggle={(on) => {
          change({ speedEnabled: on });
        }}
        toggleLabel={t("on")}
        disabled={busy}
      >
        <TemplateBlanks
          label={t("speed.template")}
          templates={templates}
          templateId={settings.speedTemplateId}
          params={settings.speedParams}
          fields={leadFields}
          disabled={busy}
          onChange={(templateId, params) => {
            change({ speedTemplateId: templateId, speedParams: params });
          }}
        />
        <p className="text-caption text-muted-foreground">{t("speed.consentHint")}</p>
      </Section>

      <Section
        title={t("follow.title")}
        description={t("follow.description")}
        on={settings.followEnabled}
        onToggle={(on) => {
          change({ followEnabled: on });
        }}
        toggleLabel={t("on")}
        disabled={busy}
      >
        {steps.length === 0 ? (
          <p className="text-muted-foreground">
            {templates.length === 0 ? t("follow.needTemplate") : t("follow.none")}
          </p>
        ) : (
          <ItemGroup className="gap-3">
            {steps.map((step, index) => (
              <Item key={index} variant="muted" className="items-start">
                <ItemContent className="gap-3">
                  <Field className="max-w-48">
                    <FieldLabel htmlFor={`${ids.days}-${String(index)}`}>
                      {t("follow.day", { number: index + 1 })}
                    </FieldLabel>
                    <Input
                      id={`${ids.days}-${String(index)}`}
                      inputMode="numeric"
                      value={String(step.days)}
                      disabled={busy}
                      onChange={(event) => {
                        const days = Number(event.target.value.replace(/\D/g, "")) || 1;
                        change({ followSteps: steps.map((one, at) => (at === index ? { ...one, days } : one)) });
                      }}
                    />
                    <FieldDescription>{t("follow.dayHint")}</FieldDescription>
                  </Field>
                  <TemplateBlanks
                    label={t("follow.template")}
                    templates={templates}
                    templateId={step.templateId}
                    params={step.params}
                    fields={leadFields}
                    disabled={busy}
                    onChange={(templateId, params) => {
                      if (templateId === null) return;
                      change({
                        followSteps: steps.map((one, at) => (at === index ? { ...one, templateId, params } : one)),
                      });
                    }}
                  />
                </ItemContent>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("follow.remove", { number: index + 1 })}
                  disabled={busy}
                  onClick={() => {
                    change({ followSteps: steps.filter((_, at) => at !== index) });
                  }}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </Item>
            ))}
          </ItemGroup>
        )}
        {steps.length < MAX_FOLLOW_STEPS && templates[0] !== undefined && (
          <Button
            variant="outline"
            className="self-start"
            disabled={busy}
            onClick={() => {
              const first = templates[0];
              if (first === undefined) return;
              const last = steps.at(-1)?.days ?? 0;
              const days = last === 0 ? 1 : last < 3 ? 3 : last + 4;
              change({ followSteps: [...steps, { days, templateId: first.id, params: [] }] });
            }}
          >
            <PlusIcon aria-hidden="true" />
            {t("follow.add")}
          </Button>
        )}
      </Section>

      <Section
        title={t("reminder.title")}
        description={t("reminder.description")}
        on={settings.reminderEnabled}
        onToggle={(on) => {
          change({ reminderEnabled: on });
        }}
        toggleLabel={t("on")}
        disabled={busy}
      >
        <Field className="max-w-48">
          <FieldLabel htmlFor={ids.days}>{t("reminder.daysBefore")}</FieldLabel>
          <Input
            id={ids.days}
            inputMode="numeric"
            value={String(settings.reminderDaysBefore)}
            disabled={busy}
            onChange={(event) => {
              change({ reminderDaysBefore: Math.min(14, Number(event.target.value.replace(/\D/g, "")) || 0) });
            }}
          />
        </Field>
        <TemplateBlanks
          label={t("reminder.template")}
          templates={templates}
          templateId={settings.reminderTemplateId}
          params={settings.reminderParams}
          fields={paymentFields}
          disabled={busy}
          onChange={(templateId, params) => {
            change({ reminderTemplateId: templateId, reminderParams: params });
          }}
        />
        <p className="text-caption text-muted-foreground">{t("reminder.windowHint")}</p>
      </Section>

      <Section title={t("hot.title")} description={t("hot.description")} disabled={busy}>
        <Field>
          <FieldLabel htmlFor={ids.keywords}>{t("hot.keywords")}</FieldLabel>
          <Input
            id={ids.keywords}
            value={keywords}
            disabled={busy}
            onChange={(event) => {
              setKeywords(event.target.value);
            }}
          />
          <FieldDescription>{t("hot.keywordsHint")}</FieldDescription>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={ids.travel}>{t("hot.travelDays")}</FieldLabel>
            <Input
              id={ids.travel}
              inputMode="numeric"
              value={String(settings.hotTravelDays)}
              disabled={busy}
              onChange={(event) => {
                change({ hotTravelDays: Math.min(365, Number(event.target.value.replace(/\D/g, "")) || 0) });
              }}
            />
            <FieldDescription>{t("hot.travelDaysHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.budget}>{t("hot.budget")}</FieldLabel>
            <Input
              id={ids.budget}
              inputMode="decimal"
              className="numbers"
              value={budget}
              disabled={busy}
              onChange={(event) => {
                setBudget(event.target.value);
              }}
            />
            <FieldDescription>{t("hot.budgetHint")}</FieldDescription>
          </Field>
        </div>
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

export function SalesAutomationScreen() {
  const t = useTranslations("sales.settings");
  const settings = useSalesAutomation();
  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} />
      {settings.data ? (
        <AutomationForm saved={settings.data} />
      ) : settings.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={settings.error}
          retryLabel={t("retry")}
          onRetry={() => void settings.refetch()}
        />
      ) : (
        <LoadingRows shape="twoLines" label={t("loading")} />
      )}
    </div>
  );
}
