"use client";

// /settings/ai (the AI sales agent): the agent at a glance (its name, live or not, its last day in figures), then four
// tabs: the agent itself (how it speaks, whose way of talking it copies, and how it sells: the settings saved together
// from a bar that stays in reach), what it
// knows, what it learned from the chats, and a question to try it on. Which model answers is the platform's setting;
// with none set, the screen says so and nothing runs.
import { saveAiSettingsInput, type AiSettings, type SaveAiSettingsInput } from "@travel-crm/contracts/ai";
import { BookOpenIcon, BotIcon, BrainIcon, SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { BackToSettings } from "@/components/back-to-settings";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWriteAccess } from "@/subscription/write-access";
import { AiHero } from "./ai-hero";
import { KnowledgeSection } from "./knowledge-section";
import { LearningsSection } from "./learnings-section";
import { PersonalityCard } from "./personality-card";
import { SellingCard } from "./selling-card";
import { useAiSettings, useSaveAiSettings, useTestAi } from "./use-ai";
import { VoicePanel } from "./voice-panel";

const inputOf = (settings: AiSettings): SaveAiSettingsInput => ({
  autopilot: settings.autopilot,
  scoring: settings.scoring,
  agentName: settings.agentName,
  instructions: settings.instructions,
  followUpHours: settings.followUpHours,
  maxRepliesPerDay: Math.max(1, settings.maxRepliesPerDay),
  language: settings.language,
  languageOther: settings.languageOther,
  style: settings.style,
  emojis: settings.emojis,
  tone: settings.tone,
  handoff: settings.handoff,
  smartFollowUp: settings.smartFollowUp,
  learning: settings.learning,
  persona: settings.persona,
});

/** Talk like a real person, in every chat: saved on its own, as soon as the AI has read the chat. */
function VoiceCard({ voice }: { voice: AiSettings["voice"] }) {
  const t = useTranslations("ai.voice");
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <VoicePanel conversationId={null} voice={voice} />
      </CardContent>
    </Card>
  );
}

/** The agent's two cards, and the bar that saves them both. */
function AgentForm({ saved }: { saved: AiSettings }) {
  const t = useTranslations("ai.settings");
  const access = useWriteAccess("change");
  const save = useSaveAiSettings();
  const [settings, setSettings] = useState(saved);
  const [problem, setProblem] = useState(false);
  const busy = save.isPending || !access.allowed;
  const dirty = JSON.stringify(inputOf(settings)) !== JSON.stringify(inputOf(saved));
  const change = (patch: Partial<SaveAiSettingsInput>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };
  const submit = () => {
    const parsed = saveAiSettingsInput.safeParse(inputOf(settings));
    setProblem(!parsed.success);
    if (parsed.success) save.mutate(parsed.data, { onSuccess: () => toast.success(t("saved")) });
  };
  return (
    <div className="flex flex-col gap-6">
      <PersonalityCard settings={settings} change={change} disabled={busy} />
      <VoiceCard voice={saved.voice} />
      <SellingCard settings={settings} change={change} disabled={busy} />
      {/* Above the phone's bottom bar (56px and the safe area); at the screen's foot from a tablet up. */}
      <div className="sticky bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-(--z-sticky) -mx-1 flex flex-wrap items-center gap-3 bg-background/95 px-1 py-3 backdrop-blur md:bottom-0">
        <Button size="lg" disabled={busy || !dirty} onClick={submit}>
          {save.isPending && <Spinner aria-hidden="true" />}
          {save.isPending ? t("saving") : t("save")}
        </Button>
        <span className="text-caption text-muted-foreground" aria-live="polite">
          {dirty ? t("unsaved") : t("allSaved")}
        </span>
        {problem && <p className="text-status-bad-ink">{t("problem")}</p>}
        <RefusalAlert error={save.error} />
      </div>
    </div>
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
      <CardContent className="flex flex-col gap-4">
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
          // The answer as the customer would see it: in our green bubble on the chat's wallpaper.
          <div className="flex flex-col gap-2 rounded-lg bg-chat-wallpaper p-4">
            <p className="self-start rounded-lg rounded-tl-none bg-chat-bubble-in px-3 py-2">{question}</p>
            <p className="max-w-[85%] self-end rounded-lg rounded-tr-none bg-chat-bubble-out px-3 py-2 whitespace-pre-line">
              {test.data.answer === "" ? t("noAnswer") : test.data.answer}
            </p>
            {test.data.handoff && (
              <p className="self-end text-caption text-status-attention-ink">
                {t("handoff", { reason: test.data.reason === "" ? t("noReason") : test.data.reason })}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AiSettingsScreen() {
  const t = useTranslations("ai.settings");
  const settings = useAiSettings();
  return (
    <div className="flex max-w-[920px] flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} />
      {settings.data ? (
        <>
          {!settings.data.configured && (
            <Alert>
              <SparklesIcon aria-hidden="true" />
              <AlertTitle>{t("model.offTitle")}</AlertTitle>
              <AlertDescription>{t("model.offDescription")}</AlertDescription>
            </Alert>
          )}
          <AiHero settings={settings.data} />
          <Tabs defaultValue="agent">
            <TabsList className="w-full overflow-x-auto sm:w-fit">
              <TabsTrigger value="agent">
                <BotIcon aria-hidden="true" />
                {t("tabs.agent")}
              </TabsTrigger>
              <TabsTrigger value="knowledge">
                <BookOpenIcon aria-hidden="true" />
                {t("tabs.knowledge")}
              </TabsTrigger>
              <TabsTrigger value="learnings">
                <BrainIcon aria-hidden="true" />
                {t("tabs.learnings")}
              </TabsTrigger>
              {settings.data.configured && (
                <TabsTrigger value="try">
                  <SparklesIcon aria-hidden="true" />
                  {t("tabs.try")}
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="agent" className="pt-4">
              <AgentForm saved={settings.data} />
            </TabsContent>
            <TabsContent value="knowledge" className="pt-4">
              <KnowledgeSection />
            </TabsContent>
            <TabsContent value="learnings" className="pt-4">
              <LearningsSection settings={settings.data} />
            </TabsContent>
            {settings.data.configured && (
              <TabsContent value="try" className="pt-4">
                <TryIt />
              </TabsContent>
            )}
          </Tabs>
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
