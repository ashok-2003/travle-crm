"use client";

// /console/organizations/<id>/ai-traces/<traceId>: one lite agent turn, whole, a super admin's alone: its index row,
// then one part at a time. Opening it is written in the platform log, so it is fetched once. A turn no longer kept
// (14 days, or its customer erased) says so; a missing file is said plainly with the row still shown.
import { InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Details } from "@/components/details";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useInstantText } from "@/components/instant-text";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink, TextLink } from "@/components/text-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { refusalOf } from "@/data/api-error";
import { consoleRoutes } from "../routes";
import { isSuperAdmin, useStaff } from "../session/staff-context";
import { DecisionPart, LookupsPart, SentPart, UnderstandPart, WritePart } from "./ai-trace-parts";
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
  const { trace, priced, file } = turn.data;
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
    ...(file === null || file.promptVersions.length === 0
      ? []
      : [
          {
            label: t("details.prompts"),
            value: (
              <span className="flex flex-col">
                {file.promptVersions.map((piece) => (
                  <span key={piece.name} className="numbers wrap-anywhere">
                    {piece.current === null || piece.current === piece.used
                      ? t("promptVersion", { name: piece.name, used: piece.used })
                      : t("promptChanged", { name: piece.name, used: piece.used, current: piece.current })}
                  </span>
                ))}
              </span>
            ),
            hint: (
              <TextLink href={consoleRoutes.aiPrompts} inline>
                {t("promptsLink")}
              </TextLink>
            ),
          },
        ]),
  ];
  return (
    <>
      <Details rows={rows} />
      <TextLink href={consoleRoutes.aiTraces(organizationId, trace.conversationId)}>{t("thisChat")}</TextLink>
      {file === null ? (
        <Alert>
          <InfoIcon aria-hidden="true" />
          <AlertDescription>{t("fileMissing")}</AlertDescription>
        </Alert>
      ) : (
        <Tabs defaultValue="understand" className="gap-4">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="understand">{t("tabs.understand")}</TabsTrigger>
            <TabsTrigger value="lookups">{t("tabs.lookups", { count: file.lookups.length })}</TabsTrigger>
            <TabsTrigger value="decision">{t("tabs.decision")}</TabsTrigger>
            <TabsTrigger value="write">{t("tabs.write")}</TabsTrigger>
            <TabsTrigger value="sent">{t("tabs.sent")}</TabsTrigger>
          </TabsList>
          <TabsContent value="understand">
            <UnderstandPart file={file} />
          </TabsContent>
          <TabsContent value="lookups">
            <LookupsPart file={file} />
          </TabsContent>
          <TabsContent value="decision">
            <DecisionPart file={file} />
          </TabsContent>
          <TabsContent value="write">
            <WritePart file={file} />
          </TabsContent>
          <TabsContent value="sent">
            <SentPart file={file} />
          </TabsContent>
        </Tabs>
      )}
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
