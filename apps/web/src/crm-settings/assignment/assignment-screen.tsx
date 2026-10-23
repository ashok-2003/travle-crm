"use client";

// Lead assignment (release 4, spec 3.1): who the leads that arrive by themselves go to, and the hours and wait that
// time the slow-reply alert. Loads the settings and the people who work leads, then hands them to the form.
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { BackToSettings } from "@/components/back-to-settings";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { useTRPC } from "@/data/trpc";
import { useLeadOwners } from "@/leads/use-lead-owners";
import { AssignmentForm } from "./assignment-form";

export function AssignmentScreen() {
  const t = useTranslations("settings.assignment");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const settings = useQuery(trpc.assignment.get.queryOptions());
  const owners = useLeadOwners();
  const body = () => {
    if (settings.isError || owners.isError) {
      const failed = settings.isError ? settings : owners;
      return (
        <ErrorState
          message={settings.isError ? t("loadFailed") : t("pool.ownersFailed")}
          error={failed.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void failed.refetch()}
        />
      );
    }
    if (settings.data === undefined || owners.data === undefined) return <LoadingRows rows={5} shape="twoLines" />;
    // Keyed by when the settings were read, so a save's stored copy replaces what was typed.
    return <AssignmentForm key={settings.dataUpdatedAt} settings={settings.data} workers={owners.data} />;
  };
  return (
    <div className="flex flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} />
      {body()}
    </div>
  );
}
