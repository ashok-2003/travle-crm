"use client";

// /ai-agent/setup: what the AI agent needs before it answers, on a page of its own with a way back to the AI agent. How
// far it has come ("4 of 7 done", a violet bar), then the checklist in the api's order, each step a row with its state
// and one button (one editor open at a time), then the switch that turns the agent on.
import { agentSetupSteps } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/text-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemGroup, ItemSeparator } from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { routes } from "@/lib/routes";
import { setupProgress } from "./agent-state";
import { hasEditor, StepRow, type StepKey } from "./setup/step-row";
import { TurnOnStep } from "./setup/turn-on-step";
import { useAgentSetup } from "./use-agent";

/** The step a "#step-<key>" address names, if it is one the page has. */
function stepKeyOfHash(hash: string): StepKey | null {
  const key = hash.replace(/^#step-/, "");
  return agentSetupSteps.find((one) => one === key) ?? null;
}

export function AgentSetupScreen() {
  const t = useTranslations("aiAgent");
  const progressId = useId();
  // Arriving from a link to a step (#step-payment) opens that step's editor, if it has one here; the page scrolls to the
  // step either way, once the checklist has loaded.
  const [openKey, setOpenKey] = useState<StepKey | null>(() => {
    const key = typeof window === "undefined" ? null : stepKeyOfHash(window.location.hash);
    return key !== null && hasEditor(key) ? key : null;
  });
  const query = useAgentSetup();
  const setup = query.data;
  const loaded = setup !== undefined;
  useEffect(() => {
    if (!loaded) return;
    const key = stepKeyOfHash(window.location.hash);
    if (key !== null) document.getElementById(`step-${key}`)?.scrollIntoView();
  }, [loaded]);
  const body = () => {
    if (setup === undefined) {
      return query.isError ? (
        <LoadFailedAlert message={t("loadFailed")} error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <LoadingRows shape="twoLines" label={t("loading")} />
      );
    }
    const progress = setupProgress(setup.steps);
    return (
      <Card>
        <CardHeader>
          <CardTitle id={progressId}>{t("setup.progress", progress)}</CardTitle>
          <Progress
            value={progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)}
            aria-labelledby={progressId}
            className="mt-2 h-2 bg-[color-mix(in_oklab,var(--brand-people)_24%,var(--card))] [&>[data-slot=progress-indicator]]:bg-people"
          />
        </CardHeader>
        <CardContent>
          <ItemGroup>
            {setup.steps.map((step) => (
              <div key={step.key} id={`step-${step.key}`} role="listitem" className="scroll-mt-6">
                <StepRow
                  step={step}
                  open={openKey === step.key}
                  onToggle={() => {
                    setOpenKey(openKey === step.key ? null : step.key);
                  }}
                />
                <ItemSeparator />
              </div>
            ))}
            <Item role="listitem">
              <ItemContent>
                <TurnOnStep ready={setup.ready} on={setup.on} pausedBySupport={setup.pausedBySupport} />
              </ItemContent>
            </Item>
          </ItemGroup>
        </CardContent>
      </Card>
    );
  };
  return (
    <div className="flex max-w-[960px] flex-col gap-6">
      <BackLink href={routes.aiAgent} label={t("setup.back")} />
      <PageHeader title={t("setup.title")} intro={t("setup.intro")} />
      {body()}
    </div>
  );
}
