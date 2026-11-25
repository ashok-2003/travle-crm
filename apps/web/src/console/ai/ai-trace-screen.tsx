"use client";

// /console/organizations/<id>/ai-traces/<traceId>: one agent turn's index row, a super admin's alone (its detail is in
// Langfuse). Opening it is written in the platform log, so it is fetched once. A turn no longer kept (14 days, or its
// customer erased) says so.
import { InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Details } from "@/components/details";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useInstantText } from "@/components/instant-text";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink, TextLink } from "@/components/text-link";
import { refusalOf } from "@/data/api-error";
import { consoleRoutes } from "../routes";
import { isSuperAdmin, useStaff } from "../session/staff-context";
import { useAiTrace } from "./use-ai-traces";
import { useTraceWords } from "./trace-words";

const code = (text: string | null, none: string) => <span className="numbers wrap-anywhere">{text ?? none}</span>;

function Turn({ organizationId, traceId }: { organizationId: string; traceId: string }) {
  const t = useTranslations("consoleAi.trace");
  const tNone = useTranslations("consoleAi.traces");
  const tCommon = useTranslations("common");
  const instantText = useInstantText();
  const words = useTraceWords();
  const turn = useAiTrace(organizationId, traceId);
  if (turn.data === undefined) {
    if (turn.isError) {
      const status = refusalOf(turn.error)?.status;
      if (status === 404 || status === 400)
        return (
          // The way back is the page's own link above.
          <EmptyState icon={InfoIcon} message={t("notFound")} />
        );
      return (
        <ErrorState
          message={t("loadFailed")}
          error={turn.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void turn.refetch()}
        />
      );
    }
    return <LoadingRows rows={4} shape="twoLines" label={t("loading")} />;
  }
  const { trace, priced } = turn.data;
  const none = tNone("none");
  const rows = [
    { label: t("details.startedAt"), value: instantText(trace.startedAt) },
    { label: t("details.kind"), value: words.kind(trace.kind) },
    { label: t("details.outcome"), value: code(trace.outcome, none) },
    ...(trace.reason === null ? [] : [{ label: t("details.reason"), value: code(trace.reason, none) }]),
    { label: t("details.model"), value: code(trace.model, none) },
    { label: t("details.tokens"), value: words.tokens(trace.inputTokens, trace.outputTokens) },
    ...(priced && trace.costPaise !== null ? [{ label: t("details.cost"), value: words.cost(trace.costPaise) }] : []),
    { label: t("details.duration"), value: words.duration(trace.durationMs) },
  ];
  return (
    <>
      <Details rows={rows} />
      <TextLink href={consoleRoutes.aiTraces(organizationId, trace.conversationId)}>{t("thisChat")}</TextLink>
    </>
  );
}

export function AiTraceScreen({ organizationId, traceId }: { organizationId: string; traceId: string }) {
  const t = useTranslations("consoleAi");
  const superAdmin = isSuperAdmin(useStaff());
  return (
    <div className="flex flex-col gap-6">
      <BackLink href={consoleRoutes.aiTraces(organizationId)} label={t("trace.back")} />
      <PageHeader title={t("trace.title")} intro={t("trace.logged")} />
      {superAdmin ? <Turn organizationId={organizationId} traceId={traceId} /> : <p>{t("superAdminsOnly")}</p>}
    </div>
  );
}
