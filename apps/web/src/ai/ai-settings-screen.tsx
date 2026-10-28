"use client";

// /settings/ai: the agency's own switch for Suggest reply, and what it tells its AI (its tone, what to offer, what never to
// say). Off until an Owner or Admin turns it on. What the AI reads, and what it never does, are said here in plain words.
import { AI_INSTRUCTIONS_MAX, type AiSettings } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { BackToSettings } from "@/components/back-to-settings";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useWriteAccess } from "@/subscription/write-access";
import { AutopilotOverview } from "./autopilot-overview";
import { AutopilotSection } from "./autopilot-section";
import { KnowledgeSection } from "./knowledge-section";
import { LearningsSection } from "./learnings-section";
import { useAiSettings, useAutopilot, useSaveAiSettings } from "./use-ai";
import { VoiceSection } from "./voice-section";

function SettingsForm({ saved }: { saved: AiSettings }) {
  const t = useTranslations("ai.settings");
  const access = useWriteAccess("change");
  const save = useSaveAiSettings();
  const [enabled, setEnabled] = useState(saved.enabled);
  const [instructions, setInstructions] = useState(saved.instructions);
  const changed = enabled !== saved.enabled || instructions.trim() !== saved.instructions;
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ enabled, instructions: instructions.trim() }, { onSuccess: () => toast.success(t("saved")) });
      }}
    >
      {!saved.providerReady && (
        <Alert>
          <AlertDescription>{t("notReady")}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t("switchTitle")}</CardTitle>
          <CardDescription>{t("switchIntro")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Switch id="ai-on" checked={enabled} onCheckedChange={setEnabled} disabled={save.isPending} />
            <Label htmlFor="ai-on">{t("on")}</Label>
          </div>
          <p className="text-muted-foreground">
            {t("usage", { used: saved.usedThisMonth, limit: saved.monthlyLimit })}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("instructionsTitle")}</CardTitle>
          <CardDescription>{t("instructionsIntro")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="ai-instructions">{t("instructions")}</Label>
          <Textarea
            id="ai-instructions"
            rows={6}
            maxLength={AI_INSTRUCTIONS_MAX}
            placeholder={t("instructionsPlaceholder")}
            value={instructions}
            disabled={save.isPending}
            onChange={(event) => {
              setInstructions(event.target.value);
            }}
          />
          <p className="text-label text-muted-foreground">{t("instructionsHint")}</p>
        </CardContent>
      </Card>
      <RefusalAlert error={save.error} />
      <Button type="submit" className="self-start" disabled={save.isPending || !access.allowed || !changed}>
        {save.isPending && <Spinner aria-hidden="true" />}
        {save.isPending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}

function AutopilotParts({ aiOn }: { aiOn: boolean }) {
  const autopilot = useAutopilot();
  if (autopilot.data === undefined) return null;
  return (
    <>
      <AutopilotOverview />
      <AutopilotSection key={String(autopilot.dataUpdatedAt)} saved={autopilot.data} aiOn={aiOn} />
      <LearningsSection learnedAt={autopilot.data.learnedAt} learning={autopilot.data.learning} />
      <VoiceSection voice={autopilot.data.voice} />
    </>
  );
}

export function AiSettingsScreen() {
  const t = useTranslations("ai.settings");
  const settings = useAiSettings();
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} />
      {settings.data ? (
        <>
          <SettingsForm key={String(settings.dataUpdatedAt)} saved={settings.data} />
          <KnowledgeSection />
          <AutopilotParts aiOn={settings.data.enabled} />
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
