"use client";

// An agency's AI agent setup on its console page, for all platform staff: whether the agency turned the agent on, which
// required steps are still undone, whether its plan has the AI, and whether it will answer yet. Super admins also get
// the link to the AI's turns.
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { StatusBadge } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { useConsoleTRPC } from "../../data/console-trpc";
import { consoleRoutes } from "../../routes";
import { isSuperAdmin, useStaff } from "../../session/staff-context";
import { DetailSection } from "./detail-list";

export function OrganizationAgentState({ organizationId }: { organizationId: string }) {
  const t = useTranslations("consoleWhatsapp");
  const tAi = useTranslations("consoleAi");
  const format = useFormatter();
  const trpc = useConsoleTRPC();
  const mayOpenTurns = isSuperAdmin(useStaff());
  const state = useQuery(trpc.aiAgent.agentState.queryOptions({ organizationId }));
  const pause = useQuery(trpc.aiAgent.organizationPause.queryOptions({ organizationId }));

  if (state.data === undefined) {
    return (
      <DetailSection id="agent-state-heading" heading={t("agentState.title")}>
        {state.isError ? (
          <ErrorState
            message={t("agentState.loadFailed")}
            error={state.error}
            retryLabel={t("retry")}
            onRetry={() => void state.refetch()}
          />
        ) : (
          <LoadingRows shape="twoLines" label={t("agentState.loading")} />
        )}
      </DetailSection>
    );
  }
  const { on, missing, planHasAi, answering } = state.data;
  // A pause shows as the state, so this block never says "ready" while the pause block says "paused".
  const paused = pause.data !== undefined && (pause.data.agency !== null || pause.data.everyone !== null);
  const steps = format.list(
    missing.map((step) => t(`agentState.steps.${step}`)),
    { type: "conjunction" },
  );

  return (
    <DetailSection id="agent-state-heading" heading={t("agentState.title")}>
      <p className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={answering && !paused ? "good" : "attention"}>
          {paused ? t("agentState.paused") : answering ? t("agentState.answering") : t("agentState.notAnswering")}
        </StatusBadge>
        <span>{on ? t("agentState.on") : t("agentState.off")}</span>
      </p>
      <p className="text-muted-foreground">
        {missing.length === 0 ? t("agentState.ready") : t("agentState.missing", { steps })}
      </p>
      {!planHasAi && <p className="text-muted-foreground">{t("agentState.noAi")}</p>}
      {mayOpenTurns && <TextLink href={consoleRoutes.aiTraces(organizationId)}>{tAi("traces.link")}</TextLink>}
    </DetailSection>
  );
}
