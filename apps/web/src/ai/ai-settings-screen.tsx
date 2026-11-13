"use client";

// /settings/ai: the agency's own switches for the AI, for scoring leads and for filling them, how quote write-ups sound,
// what it tells its AI (with ready lines to add), the documents package drafts are written from, and a way to the AI agent
// page, where the agent that answers WhatsApp is set up. Off until an Owner or Admin turns it on.
import { writeStyles, type AiSettings, type WriteStyle } from "@travel-crm/contracts/ai";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TextLink } from "@/components/text-link";
import { routes } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { DraftPackagesSection } from "./drafts/draft-packages-section";
import { KnowledgeSection } from "./knowledge-section";
import { useAiSettings, useSaveAiSettings } from "./use-ai";

export function SettingsForm({ saved }: { saved: AiSettings }) {
  const t = useTranslations("ai.settings");
  const access = useWriteAccess("change");
  const save = useSaveAiSettings();
  const [enabled, setEnabled] = useState(saved.enabled);
  const [scoring, setScoring] = useState(saved.scoring);
  const [fillLeads, setFillLeads] = useState(saved.fillLeads);
  const [writeStyle, setWriteStyle] = useState<WriteStyle>(saved.writeStyle);
  const changed =
    writeStyle !== saved.writeStyle ||
    enabled !== saved.enabled ||
    scoring !== saved.scoring ||
    fillLeads !== saved.fillLeads;
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ enabled, scoring, fillLeads, writeStyle }, { onSuccess: () => toast.success(t("saved")) });
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
          <div className="flex items-center gap-3">
            <Switch id="ai-scoring" checked={scoring} onCheckedChange={setScoring} disabled={save.isPending} />
            <Label htmlFor="ai-scoring">{t("scoring")}</Label>
          </div>
          <p className="text-label text-muted-foreground">{t("scoringHint")}</p>
          <div className="flex items-center gap-3">
            <Switch id="ai-fill-leads" checked={fillLeads} onCheckedChange={setFillLeads} disabled={save.isPending} />
            <Label htmlFor="ai-fill-leads">{t("fillLeads")}</Label>
          </div>
          <p className="text-label text-muted-foreground">{t("fillLeadsHint")}</p>
          <p className="text-muted-foreground">
            {t("usage", { used: saved.usedThisMonth, limit: saved.monthlyLimit })}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("writeStyleTitle")}</CardTitle>
          <CardDescription>{t("writeStyleHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label={t("writeStyle")}
            value={writeStyle}
            disabled={save.isPending}
            onValueChange={(chosen) => {
              const style = writeStyles.find((one) => one === chosen);
              if (style !== undefined) setWriteStyle(style);
            }}
            className="flex-wrap"
          >
            {writeStyles.map((one) => (
              <ToggleGroupItem key={one} value={one} className="min-h-11 px-4">
                {t(`writeStyles.${one}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
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

export function AiSettingsScreen() {
  const t = useTranslations("ai.settings");
  const settings = useAiSettings();
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} />
      <Alert>
        <AlertDescription className="flex flex-wrap items-center gap-x-2">
          {t("moved")}
          <TextLink inline href={routes.aiAgent}>
            {t("openAgent")}
          </TextLink>
        </AlertDescription>
      </Alert>
      {settings.data ? (
        <>
          <SettingsForm key={String(settings.dataUpdatedAt)} saved={settings.data} />
          <KnowledgeSection />
          <DraftPackagesSection />
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
