"use client";

// /leads/import (spec 3.2 step 1): what an import does, the file button, a sample file, and the person's Recent
// imports. The file goes straight to storage; the screen then follows the import's own address, where the worker's
// reading is shown. Each step's calls are the leadImports procedures; the shared pieces do the rest.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/text-link";
import { useTRPC } from "@/data/trpc";
import { ImportStepCaption } from "@/imports/import-step-caption";
import { ImportFileStep } from "@/imports/import-file-step";
import { RecentImports } from "@/imports/recent-imports";
import { leadImportRoute, routes } from "@/lib/routes";
import { useRefreshLeadImports } from "./use-lead-import";

const MAX_LEAD_ROWS = 10_000;
const SAMPLE = "/samples/leads-sample.csv";

export function ChooseFileScreen() {
  const t = useTranslations("leads.import");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const router = useRouter();
  const refresh = useRefreshLeadImports();
  const start = useMutation(trpc.leadImports.start.mutationOptions());
  const confirm = useMutation(trpc.leadImports.confirmUpload.mutationOptions());
  const cancel = useMutation(trpc.leadImports.cancel.mutationOptions({ onSuccess: refresh }));
  const recent = useQuery(trpc.leadImports.recent.queryOptions());

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackLink href={routes.leads} label={t("back")} />
      <PageHeader title={t("title")} intro={t("intro")} />
      <ImportStepCaption status="uploading" />
      <ImportFileStep
        maxRows={MAX_LEAD_ROWS}
        sampleHref={SAMPLE}
        start={(file) => start.mutateAsync(file)}
        confirm={(importId) => confirm.mutateAsync({ importId })}
        cancel={(importId) => cancel.mutateAsync({ importId })}
        onUploaded={(importId) => {
          void refresh();
          router.push(leadImportRoute(importId));
        }}
      />
      {recent.isPending && <LoadingRows rows={3} shape="twoLines" />}
      {recent.isError && (
        <ErrorState
          message={t("recentFailed")}
          error={recent.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void recent.refetch()}
        />
      )}
      {recent.data && <RecentImports imports={recent.data} hrefOf={leadImportRoute} />}
    </div>
  );
}
