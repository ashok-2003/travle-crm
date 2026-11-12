"use client";

// The switch that pauses the WhatsApp AI agent for one agency, on its console page: its own state and the pause for every
// agency in words for all platform staff, and Pause or Resume for this agency (asked once more) for super admins only.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatDayTime } from "@/lib/format";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";
import { useConsoleTRPC } from "../../data/console-trpc";
import { isSuperAdmin, useStaff } from "../../session/staff-context";
import { DetailSection } from "./detail-list";

export function OrganizationAgentPause({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const t = useTranslations("consoleWhatsapp");
  const trpc = useConsoleTRPC();
  const queryClient = useQueryClient();
  const mayChange = isSuperAdmin(useStaff());
  const state = useQuery(trpc.aiAgent.organizationPause.queryOptions({ organizationId }));
  const [confirming, setConfirming] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const change = useMutation(
    trpc.aiAgent.pauseOrganization.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.aiAgent.pathKey() });
        setConfirming(false);
      },
    }),
  );

  if (state.data === undefined) {
    return (
      <DetailSection id="agent-pause-heading" heading={t("agentPause.agency.title")}>
        {state.isError ? (
          <ErrorState
            message={t("agentPause.loadFailed")}
            error={state.error}
            retryLabel={t("retry")}
            onRetry={() => void state.refetch()}
          />
        ) : (
          <LoadingRows shape="twoLines" label={t("agentPause.loading")} />
        )}
      </DetailSection>
    );
  }
  const { agency, everyone } = state.data;
  const paused = agency !== null;
  const dialog = paused ? "resumeDialog" : "pauseDialog";
  const at = (instant: string) => formatDayTime(new Date(instant), { timeZone: PLATFORM_TIME_ZONE });

  return (
    <DetailSection id="agent-pause-heading" heading={t("agentPause.agency.title")}>
      <div className="flex flex-col gap-2">
        {paused ? (
          <p className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="attention">{t("agentPause.status.paused")}</StatusBadge>
            <span className="text-muted-foreground">
              {t("agentPause.agency.pausedAgency", { time: at(agency.since) })}
            </span>
          </p>
        ) : (
          everyone === null && (
            <p>
              <StatusBadge tone="good">{t("agentPause.agency.running")}</StatusBadge>
            </p>
          )
        )}
        {everyone !== null && (
          <p className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="attention">{t("agentPause.status.paused")}</StatusBadge>
            <span className="text-muted-foreground">
              {t("agentPause.agency.pausedEveryone", { time: at(everyone.since) })}
            </span>
          </p>
        )}
      </div>
      {mayChange && (
        <div>
          <Button
            ref={button}
            variant="outline"
            onClick={() => {
              setConfirming(true);
            }}
          >
            {paused ? t("agentPause.agency.resume") : t("agentPause.agency.pause")}
          </Button>
        </div>
      )}
      {change.isError && !confirming && <RefusalAlert error={change.error} />}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t(`agentPause.agency.${dialog}.title`, { name: organizationName })}
        description={t(`agentPause.agency.${dialog}.description`, { name: organizationName })}
        action={t(`agentPause.agency.${dialog}.confirm`)}
        destructive={!paused}
        request={change}
        onConfirm={() => {
          change.mutate({ organizationId, paused: !paused });
        }}
        returnFocusTo={button}
      />
    </DetailSection>
  );
}
