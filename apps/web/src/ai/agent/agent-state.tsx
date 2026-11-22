"use client";

// The AI agent's state, beside the page's title, and how far its setup has come, on the Setup button: both read the
// setup checklist. One state, in this order: support's pause wins over everything; on reads "answering" only when ready.
import { brand } from "@travel-crm/brand";
import type { AgentSetup } from "@travel-crm/contracts/ai";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { useAgentSetup } from "./use-agent";

/** Steps done of all the steps, the optional ads among them ("4 of 7"). */
export const setupProgress = (steps: AgentSetup["steps"]) => ({
  done: steps.filter((step) => step.done).length,
  total: steps.length,
});

export function AgentStateBadge() {
  const t = useTranslations("aiAgent.state");
  const setup = useAgentSetup().data;
  if (setup === undefined) return null;
  const { on, ready, pausedBySupport } = setup;
  const [tone, words] = pausedBySupport
    ? (["attention", t("paused", { product: brand.productName })] as const)
    : on
      ? ready
        ? (["good", t("on")] as const)
        : (["attention", t("onNotReady")] as const)
      : ready
        ? (["neutral", t("off")] as const)
        : (["neutral", t("notSetUp")] as const);
  return <StatusBadge tone={tone}>{words}</StatusBadge>;
}

/** The header's way to Setup: "Setup" once every step is done, "Setup · 4 of 7" until then. */
export function SetupButton() {
  const t = useTranslations("aiAgent.setupButton");
  const setup = useAgentSetup().data;
  const progress = setup === undefined ? null : setupProgress(setup.steps);
  return (
    <Button variant="outline" asChild>
      <Link href={routes.aiAgentSetup}>
        {progress === null || progress.done === progress.total ? t("done") : t("progress", progress)}
      </Link>
    </Button>
  );
}
