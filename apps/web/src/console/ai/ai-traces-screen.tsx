"use client";

// /console/organizations/<id>/ai-traces: the lite agent's turns in one agency's chats over the last 14 days (or one
// chat's), a super admin's alone. Support is told so and the api is not asked, which would refuse.
import { InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { ShowMoreButton } from "@/components/show-more-button";
import { BackLink, TextLink } from "@/components/text-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useWideScreen } from "@/lib/use-wide-screen";
import { consoleRoutes } from "../routes";
import { isSuperAdmin, useStaff } from "../session/staff-context";
import { AiTraceItems } from "./ai-trace-items";
import { AiTraceTable } from "./ai-trace-table";
import { useAiTraces } from "./use-ai-traces";

function Turns({ organizationId, conversationId }: { organizationId: string; conversationId: string | null }) {
  const t = useTranslations("consoleAi.traces");
  const tCommon = useTranslations("common");
  const wide = useWideScreen();
  const turns = useAiTraces(organizationId, conversationId);
  const traces = turns.items;
  if (traces === undefined) {
    return turns.isError ? (
      <ErrorState
        message={t("loadFailed")}
        error={turns.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void turns.refetch()}
      />
    ) : (
      <LoadingRows rows={3} shape={wide ? "table" : "twoLines"} columns={8} label={t("loading")} />
    );
  }
  const priced = turns.data?.pages[0]?.priced ?? false;
  return (
    <>
      {!priced && (
        <Alert>
          <InfoIcon aria-hidden="true" />
          <AlertTitle>{t("noPricesTitle")}</AlertTitle>
          <AlertDescription>{t("noPricesDescription")}</AlertDescription>
        </Alert>
      )}
      {traces.length === 0 ? (
        <EmptyState icon={InfoIcon} message={t("empty")} />
      ) : wide ? (
        <AiTraceTable organizationId={organizationId} traces={traces} priced={priced} />
      ) : (
        <AiTraceItems organizationId={organizationId} traces={traces} priced={priced} />
      )}
      {/* A refresh that failed while the list shows: the list stays, and says so. */}
      {turns.isRefetchError && !turns.isFetchNextPageError && (
        <LoadFailedAlert message={t("loadFailed")} error={turns.error} onRetry={() => void turns.refetch()} />
      )}
      {/* A later page can fail on its own: a cursor whose turn was deleted since. The list so far stays. */}
      {turns.isFetchNextPageError && (
        <>
          <RefusalAlert error={turns.error} />
          <Button variant="outline" className="self-center" onClick={() => void turns.restart()}>
            {t("startAgain")}
          </Button>
        </>
      )}
      {!turns.isFetchNextPageError && <ShowMoreButton pages={turns} label={t("showMore")} />}
    </>
  );
}

export function AiTracesScreen({
  organizationId,
  conversationId,
}: {
  organizationId: string;
  conversationId: string | null;
}) {
  const t = useTranslations("consoleAi");
  const superAdmin = isSuperAdmin(useStaff());
  return (
    <div className="flex flex-col gap-6">
      <BackLink href={consoleRoutes.organization(organizationId)} label={t("traces.back")} />
      <PageHeader
        title={t("traces.title")}
        intro={
          conversationId === null ? (
            t("traces.intro")
          ) : (
            <>
              {t("traces.chatIntro")}{" "}
              <TextLink href={consoleRoutes.aiTraces(organizationId)} inline>
                {t("traces.allChats")}
              </TextLink>
            </>
          )
        }
      />
      {superAdmin ? (
        <Turns organizationId={organizationId} conversationId={conversationId} />
      ) : (
        <p>{t("superAdminsOnly")}</p>
      )}
    </div>
  );
}
