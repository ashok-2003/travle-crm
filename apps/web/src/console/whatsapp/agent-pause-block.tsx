"use client";

// The switch that pauses the WhatsApp AI agent for every agency, at the top of the console's WhatsApp screen: its state
// in words for all platform staff, and Pause or Resume (asked once more) for super admins only.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDayTime } from "@/lib/format";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";
import { useConsoleTRPC } from "../data/console-trpc";
import { DetailSection } from "../organizations/organization/detail-list";
import { isSuperAdmin, useStaff } from "../session/staff-context";

export function AgentPauseBlock() {
  const t = useTranslations("consoleWhatsapp");
  const trpc = useConsoleTRPC();
  const queryClient = useQueryClient();
  const mayChange = isSuperAdmin(useStaff());
  const state = useQuery(trpc.aiAgent.pauseState.queryOptions());
  const [confirming, setConfirming] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const change = useMutation(
    trpc.aiAgent.pauseEveryone.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.aiAgent.pathKey() });
        setConfirming(false);
      },
    }),
  );

  const oneAtATimeButton = useRef<HTMLButtonElement>(null);
  const [askingOneAtATime, setAskingOneAtATime] = useState(false);
  const oneAtATime = useMutation(
    trpc.aiAgent.resumeOneAtATime.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.aiAgent.pathKey() });
        setAskingOneAtATime(false);
      },
    }),
  );

  if (state.data === undefined) {
    return (
      <DetailSection id="agent-pause-heading" heading={t("agentPause.everyone.title")}>
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
  const { everyone } = state.data;
  const paused = everyone !== null;
  const dialog = paused ? "resumeDialog" : "pauseDialog";

  return (
    <DetailSection id="agent-pause-heading" heading={t("agentPause.everyone.title")}>
      <p className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={paused ? "attention" : "good"}>
          {paused ? t("agentPause.status.paused") : t("agentPause.status.running")}
        </StatusBadge>
        <span className="text-muted-foreground">
          {paused
            ? t("agentPause.everyone.paused", {
                time: formatDayTime(new Date(everyone.since), { timeZone: PLATFORM_TIME_ZONE }),
              })
            : t("agentPause.everyone.running")}
        </span>
      </p>
      {mayChange && (
        <div className="flex flex-wrap gap-2">
          <Button
            ref={button}
            variant="outline"
            onClick={() => {
              setConfirming(true);
            }}
          >
            {paused ? t("agentPause.everyone.resume") : t("agentPause.everyone.pause")}
          </Button>
          {paused && (
            <Button
              ref={oneAtATimeButton}
              variant="outline"
              onClick={() => {
                setAskingOneAtATime(true);
              }}
            >
              {t("agentPause.oneAtATime")}
            </Button>
          )}
        </div>
      )}
      {oneAtATime.data !== undefined && (
        <Alert>
          <AlertDescription>{t("agentPause.oneAtATimeDone", { count: oneAtATime.data.paused })}</AlertDescription>
        </Alert>
      )}
      <ConfirmDialog
        open={askingOneAtATime}
        onOpenChange={setAskingOneAtATime}
        title={t("agentPause.oneAtATimeTitle")}
        description={t("agentPause.oneAtATimeBody")}
        action={t("agentPause.oneAtATimeConfirm")}
        destructive={false}
        request={oneAtATime}
        onConfirm={() => {
          oneAtATime.mutate();
        }}
        returnFocusTo={oneAtATimeButton}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t(`agentPause.everyone.${dialog}.title`)}
        description={t(`agentPause.everyone.${dialog}.description`)}
        action={t(`agentPause.everyone.${dialog}.confirm`)}
        destructive={!paused}
        request={change}
        onConfirm={() => {
          change.mutate({ paused: !paused });
        }}
        returnFocusTo={button}
      />
    </DetailSection>
  );
}
