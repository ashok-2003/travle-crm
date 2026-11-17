"use client";

// Which agent answers one agency's WhatsApp chats, on its console page: the current agent in words and the last replay's
// result for all platform staff, and "Change agent" for super admins only, which asks once more and lists the gate
// before a move to the new agent.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { Button } from "@/components/ui/button";
import { formatDayTime } from "@/lib/format";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";
import { useConsoleTRPC } from "../../data/console-trpc";
import { isSuperAdmin, useStaff } from "../../session/staff-context";
import { DetailList, DetailSection } from "./detail-list";

const GATE_STEPS = ["bench", "replay", "tryIt"] as const;

export function OrganizationAgentChoice({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const t = useTranslations("consoleOrganizations.agentChoice");
  const trpc = useConsoleTRPC();
  const queryClient = useQueryClient();
  const mayChange = isSuperAdmin(useStaff());
  const state = useQuery(trpc.aiAgent.agentChoice.queryOptions({ organizationId }));
  const [confirming, setConfirming] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const change = useMutation(
    trpc.aiAgent.chooseAgent.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.aiAgent.pathKey() });
        setConfirming(false);
      },
    }),
  );

  if (state.data === undefined) {
    return (
      <DetailSection id="agent-choice-heading" heading={t("title")}>
        {state.isError ? (
          <ErrorState
            message={t("loadFailed")}
            error={state.error}
            retryLabel={t("retry")}
            onRetry={() => void state.refetch()}
          />
        ) : (
          <LoadingRows shape="twoLines" label={t("loading")} />
        )}
      </DetailSection>
    );
  }
  const { agent, lastReplay } = state.data;
  const target = agent === "lite" ? "natural" : "lite";

  return (
    <DetailSection id="agent-choice-heading" heading={t("title")}>
      <DetailList
        details={[
          { label: t("current"), value: t(`agents.${agent}`) },
          ...(lastReplay === null
            ? []
            : [
                {
                  label: t("lastReplay"),
                  value: t("replayResult", {
                    passed: lastReplay.passed,
                    chats: lastReplay.chats,
                    time: formatDayTime(new Date(lastReplay.at), { timeZone: PLATFORM_TIME_ZONE }),
                  }),
                },
              ]),
        ]}
      />
      {mayChange && (
        <div>
          <Button
            ref={button}
            variant="outline"
            onClick={() => {
              setConfirming(true);
            }}
          >
            {t("change")}
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("dialog.title", { name: organizationName, agent: t(`agents.${target}`) })}
        description={t(`dialog.description.${target}`, { name: organizationName })}
        action={t("dialog.confirm")}
        destructive={false}
        request={change}
        onConfirm={() => {
          change.mutate({ organizationId, agent: target });
        }}
        returnFocusTo={button}
      >
        {target === "natural" && (
          <div className="flex flex-col gap-1">
            <p className="font-medium">{t("dialog.gate")}</p>
            <ul className="list-disc pl-5 text-muted-foreground">
              {GATE_STEPS.map((step) => (
                <li key={step}>{t(`dialog.steps.${step}`)}</li>
              ))}
            </ul>
          </div>
        )}
      </ConfirmDialog>
    </DetailSection>
  );
}
