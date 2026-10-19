"use client";

// The staff import's first step (spec 3.2, 3.4): the file, what it may be, a sample to start from, and the person's
// last ten staff imports. Each file goes straight to storage, and the screen then follows its import's address.
import { useQuery } from "@tanstack/react-query";
import { importRowLimits } from "@travel-crm/contracts/imports";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/text-link";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { ImportFileStep } from "@/imports/import-file-step";
import { RecentImports } from "@/imports/recent-imports";
import { routes, staffImportRoute } from "@/lib/routes";

export function StaffChooseFile() {
  const t = useTranslations("staff.import");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const trpc = useTRPC();
  const client = useTRPCClient();
  const recent = useQuery(trpc.staffImports.recent.queryOptions());
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackLink href={routes.staff} label={t("back")} />
      <PageHeader title={t("title")} intro={t("intro")} />
      <ImportFileStep
        maxRows={importRowLimits.staff}
        sampleHref="/samples/staff-sample.csv"
        start={(file) => client.staffImports.start.mutate(file)}
        confirm={(importId) => client.staffImports.confirmUpload.mutate({ importId })}
        cancel={(importId) => client.staffImports.cancel.mutate({ importId })}
        onUploaded={(importId) => {
          router.push(staffImportRoute(importId));
        }}
      />
      {recent.data ? (
        <RecentImports imports={recent.data} hrefOf={staffImportRoute} />
      ) : recent.isError ? (
        <ErrorState
          message={t("recentFailed")}
          error={recent.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void recent.refetch()}
        />
      ) : (
        <LoadingRows rows={2} />
      )}
    </div>
  );
}
