"use client";

// /settings/lead-sources/meta/pages/<pageId> (spec 3.3): one connected Page. Its name, badge and who connected it and when,
// Check now and the ⋯ menu; what stopped it, if anything, with the one thing to do; the four counts; its lead forms with
// Bring in; and the leads that couldn't be added. It asks again every 2 seconds while a check runs and every 30 otherwise,
// so the time and the counts move by themselves. A new-form notice leads here, to the form it names.
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/text-link";
import { useTRPC } from "@/data/trpc";
import { formatDay } from "@/lib/format";
import { routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { CheckNowButton } from "../../check-now-button";
import { lastCheckedText } from "../../last-checked";
import { MetaBadge } from "../meta-badge";
import { useMetaPage, useRefreshMeta } from "../use-meta-pages";
import { AttentionAlert } from "./attention-alert";
import { FormsList } from "./forms-list";
import { PageActions } from "./page-actions";
import { PageCounts } from "./page-counts";
import { Problems } from "./problems";

export function MetaPageScreen({ pageId }: { pageId: string }) {
  const t = useTranslations("metaLeads.page");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const { timeZone } = useMe().organization;
  const page = useMetaPage(pageId);
  const refresh = useRefreshMeta();
  const check = useMutation(trpc.metaLeads.checkNow.mutationOptions());
  const detail = page.data;

  if (detail === undefined) {
    if (page.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={page.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void page.refetch()}
        />
      );
    }
    return <LoadingRows rows={4} shape="twoLines" />;
  }

  const day = formatDay(new Date(detail.connectedAt), { timeZone });
  const who = detail.connectedBy?.name ?? null;
  const subtitle = who === null ? t("subtitleUnknown", { day }) : t("subtitle", { name: who, day });
  const checked =
    detail.lastCheckedAt === null
      ? t("notChecked")
      : t("lastChecked", { when: lastCheckedText(new Date(detail.lastCheckedAt), { timeZone }) });

  return (
    <div className="flex max-w-[960px] flex-col gap-6">
      <BackLink href={routes.leadSources} label={t("back")} />
      <PageHeader
        title={detail.pageName}
        intro={
          <span className="flex flex-col items-start gap-2">
            <MetaBadge badge={detail.badge} readOnly={detail.readOnly} />
            <span>{subtitle}</span>
          </span>
        }
        action={
          <div className="flex items-start gap-2">
            <CheckNowButton
              lastCheckedAt={detail.lastCheckedAt}
              checkRunning={detail.checkRunning}
              canCheck={detail.status === "running"}
              action={t("checkNow")}
              checking={t("checking")}
              checkedAt={(when) => t("checkedAt", { when })}
              check={() => check.mutateAsync({ pageId: detail.id })}
              pending={check.isPending}
              error={check.error}
              refresh={refresh}
            />
            <PageActions detail={detail} />
          </div>
        }
      />
      <div className="flex flex-col gap-1">
        <p className="text-label text-muted-foreground">{checked}</p>
        {detail.late && <p className="text-label text-muted-foreground">{t("late")}</p>}
      </div>
      <AttentionAlert detail={detail} />
      <FormsList pageId={detail.id} />
      <PageCounts detail={detail} />
      {detail.counts.couldntBeAdded > 0 && <Problems pageId={detail.id} />}
    </div>
  );
}
