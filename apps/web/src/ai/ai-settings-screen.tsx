"use client";

// /settings/ai (the AI sales agent): whether the agent answers customers on WhatsApp by itself (each chat can still be
// turned on or off), whether leads are scored, the name it signs as, the agency's own instructions, when it follows up
// a quiet customer, and a day's limit per chat; then what it knows, and a question to try it on. Which model answers is
// the platform's setting, shown here; with none set, the screen says so and nothing runs.
import { saveAiSettingsInput, type AiSettings } from "@travel-crm/contracts/ai";
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BackToSettings } from "@/components/back-to-settings";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useWriteAccess } from "@/subscription/write-access";
import { KnowledgeSection } from "./knowledge-section";
import { useAiSettings, useSaveAiSettings, useTestAi } from "./use-ai";

function SwitchRow({
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

function BehaviourForm({ saved }: { saved: AiSettings }) {
  const t = useTranslations("ai.settings");
  const access = useWriteAccess("change");
  const save = useSaveAiSettings();
  const [settings, setSettings] = useState(saved);
  const [problem, setProblem] = useState(false);
  const ids = { name: useId(), instructions: useId(), hours: useId(), limit: useId() };
  const busy = save.isPending || !access.allowed;
  const change = (patch: Partial<AiSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };
  const submit = () => {
    const parsed = saveAiSettingsInput.safeParse({
      autopilot: settings.autopilot,
      scoring: settings.scoring,
      agentName: settings.agentName,
      instructions: settings.instructions,
      followUpHours: settings.followUpHours,
      maxRepliesPerDay: Math.max(1, settings.maxRepliesPerDay),
    });
    setProblem(!parsed.success);
    if (parsed.success) save.mutate(parsed.data, { onSuccess: () => toast.success(t("saved")) });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("behaviour.title")}</h2>
        </CardTitle>
        <CardDescription>{t("behaviour.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <SwitchRow
          label={t("behaviour.autopilot")}
          hint={t("behaviour.autopilotHint")}
          checked={settings.autopilot}
          disabled={busy}
          onChange={(autopilot) => {
            change({ autopilot });
          }}
        />
        <SwitchRow
          label={t("behaviour.scoring")}
          hint={t("behaviour.scoringHint")}
          checked={settings.scoring}
          disabled={busy}
          onChange={(scoring) => {
            change({ scoring });
          }}
        />
        <Field>
          <FieldLabel htmlFor={ids.name}>{t("behaviour.name")}</FieldLabel>
          <Input
            id={ids.name}
            value={settings.agentName}
            maxLength={80}
            placeholder={t("behaviour.namePlaceholder")}
            disabled={busy}
            onChange={(event) => {
              change({ agentName: event.target.value });
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={ids.instructions}>{t("behaviour.instructions")}</FieldLabel>
          <Textarea
            id={ids.instructions}
            rows={5}
            maxLength={4000}
            value={settings.instructions}
            placeholder={t("behaviour.instructionsPlaceholder")}
            disabled={busy}
            onChange={(event) => {
              change({ instructions: event.target.value });
            }}
          />
          <FieldDescription>{t("behaviour.instructionsHint")}</FieldDescription>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={ids.hours}>{t("behaviour.followUpHours")}</FieldLabel>
            <Input
              id={ids.hours}
              inputMode="numeric"
              value={String(settings.followUpHours)}
              disabled={busy}
              onChange={(event) => {
                change({ followUpHours: numberOf(event.target.value, 23) });
              }}
            />
            <FieldDescription>{t("behaviour.followUpHoursHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.limit}>{t("behaviour.maxReplies")}</FieldLabel>
            <Input
              id={ids.limit}
              inputMode="numeric"
              value={String(settings.maxRepliesPerDay)}
              disabled={busy}
              onChange={(event) => {
                change({ maxRepliesPerDay: numberOf(event.target.value, 200) });
              }}
            />
            <FieldDescription>{t("behaviour.maxRepliesHint")}</FieldDescription>
          </Field>
        </div>
        {problem && <p className="text-status-bad-ink">{t("problem")}</p>}
        <RefusalAlert error={save.error} />
        <Button className="self-start" size="lg" disabled={busy} onClick={submit}>
          {save.isPending && <Spinner aria-hidden="true" />}
          {save.isPending ? t("saving") : t("save")}
        </Button>
      </CardContent>
    </Card>
  );
}

function TryIt() {
  const t = useTranslations("ai.settings.test");
  const test = useTestAi();
  const [question, setQuestion] = useState("");
  const id = useId();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (question.trim() !== "") test.mutate({ question });
          }}
        >
          <Field className="flex-1">
            <FieldLabel htmlFor={id}>{t("question")}</FieldLabel>
            <Input
              id={id}
              value={question}
              maxLength={1000}
              placeholder={t("placeholder")}
              onChange={(event) => {
                setQuestion(event.target.value);
              }}
            />
          </Field>
          <Button type="submit" disabled={test.isPending || question.trim() === ""}>
            {test.isPending ? <Spinner aria-hidden="true" /> : <SparklesIcon aria-hidden="true" />}
            {t("ask")}
          </Button>
        </form>
        <RefusalAlert error={test.error} />
        {test.data !== undefined && (
          <Alert>
            <SparklesIcon aria-hidden="true" />
            <AlertTitle>{t("answer")}</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              <span className="whitespace-pre-line">{test.data.answer === "" ? t("noAnswer") : test.data.answer}</span>
              {test.data.handoff && (
                <span className="text-status-attention-ink">
                  {t("handoff", { reason: test.data.reason === "" ? t("noReason") : test.data.reason })}
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function ModelStatus({ settings }: { settings: AiSettings }) {
  const t = useTranslations("ai.settings.model");
  return settings.configured ? (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
        <CardAction>
          <span className="numbers text-caption text-muted-foreground">{settings.models.chat[0]}</span>
        </CardAction>
      </CardHeader>
      <CardContent className="text-caption text-muted-foreground">
        {t("models", { chat: settings.models.chat.join(", "), fast: settings.models.fast.join(", ") })}
      </CardContent>
    </Card>
  ) : (
    <Alert>
      <SparklesIcon aria-hidden="true" />
      <AlertTitle>{t("offTitle")}</AlertTitle>
      <AlertDescription>{t("offDescription")}</AlertDescription>
    </Alert>
  );
}

export function AiSettingsScreen() {
  const t = useTranslations("ai.settings");
  const settings = useAiSettings();
  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} />
      {settings.data ? (
        <>
          <ModelStatus settings={settings.data} />
          <BehaviourForm saved={settings.data} />
          <KnowledgeSection />
          {settings.data.configured && <TryIt />}
        </>
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
