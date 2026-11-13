"use client";

// Which WhatsApp agent answers one agency, on its console page: the state in words for all platform staff (on but not
// yet answering while the agency's AI or setup isn't ready), and the switch (asked once more) for super admins only.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { Button } from "@/components/ui/button";
import { useConsoleTRPC } from "../../data/console-trpc";
import { isSuperAdmin, useStaff } from "../../session/staff-context";
import { DetailSection } from "./detail-list";

export function OrganizationLiteAgent({
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
  const state = useQuery(trpc.aiAgent.liteAgent.queryOptions({ organizationId }));
  const [confirming, setConfirming] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const change = useMutation(
    trpc.aiAgent.setLiteAgent.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.aiAgent.pathKey() });
        setConfirming(false);
      },
    }),
  );

  if (state.data === undefined) {
    return (
      <DetailSection id="lite-agent-heading" heading={t("liteAgent.title")}>
        {state.isError ? (
          <ErrorState
            message={t("liteAgent.loadFailed")}
            error={state.error}
            retryLabel={t("retry")}
            onRetry={() => void state.refetch()}
          />
        ) : (
          <LoadingRows shape="twoLines" label={t("liteAgent.loading")} />
        )}
      </DetailSection>
    );
  }
  const { lite, answering } = state.data;
  const dialog = lite ? "offDialog" : "onDialog";
  // On, it says whether the agent answers yet: the agency's AI and its setup must be ready too.
  const line = lite ? (answering ? t("liteAgent.on") : t("liteAgent.waiting")) : t("liteAgent.off");

  return (
    <DetailSection id="lite-agent-heading" heading={t("liteAgent.title")}>
      <p>{line}</p>
      {mayChange && (
        <div>
          <Button
            ref={button}
            variant="outline"
            onClick={() => {
              setConfirming(true);
            }}
          >
            {lite ? t("liteAgent.switchOff") : t("liteAgent.switchOn")}
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t(`liteAgent.${dialog}.title`, { name: organizationName })}
        description={t(`liteAgent.${dialog}.description`)}
        action={t(`liteAgent.${dialog}.confirm`)}
        request={change}
        onConfirm={() => {
          change.mutate({ organizationId, lite: !lite });
        }}
        returnFocusTo={button}
      />
    </DetailSection>
  );
}
