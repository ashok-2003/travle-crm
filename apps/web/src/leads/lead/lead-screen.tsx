"use client";

// /leads/<id> (spec 3.4): one lead, a reading panel 720px wide. The way back to Leads keeps the list's filters, which
// the list's links carry. The person and the main buttons, the stage, then the lead's cards. A lead that doesn't
// exist, was removed or is someone else's (out of the member's scope) is "not found" alike (R26), so nothing says
// another's lead exists; any other failure says so with Try again.
import { SearchXIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { BackLink } from "@/components/text-link";
import { refusalOf } from "@/data/api-error";
import { useMe, viewScope } from "@/session/me-context";
import { listFiltersHref, listFiltersOf } from "../list/list-filters";
import { LeadHeader } from "./lead-header";
import { StageBar } from "./stage-bar";
import { useLead } from "./use-lead";

export function LeadScreen({ leadId }: { leadId: string }) {
  const t = useTranslations("leads.lead");
  const tCommon = useTranslations("common");
  const scope = viewScope(useMe(), "leads:view") === "all" ? "all" : "own";
  const back = listFiltersHref(listFiltersOf(useSearchParams(), scope));
  const lead = useLead(leadId);

  const body = (): ReactNode => {
    if (lead.data) {
      return (
        <>
          <LeadHeader lead={lead.data} />
          <StageBar lead={lead.data} />
        </>
      );
    }
    if (!lead.valid || refusalOf(lead.error)?.reason === "NOT_FOUND") {
      return <EmptyState icon={SearchXIcon} message={t("notFound")} />;
    }
    if (lead.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={lead.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void lead.refetch()}
        />
      );
    }
    return <LoadingRows shape="twoLines" label={t("loading")} />;
  };

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackLink href={back} label={t("back")} />
      {body()}
    </div>
  );
}
