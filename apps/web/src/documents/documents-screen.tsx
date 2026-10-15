"use client";

// The documents screen (spec 9.3): every document the organization has issued, newest first, a page at a time, with
// its PDF once the worker has made it. Today they are the samples the branding screen previews; quotes and invoices
// join them.
import { FileTextIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BackToSettings } from "@/branding/back-to-settings";
import { Delayed } from "@/components/delayed";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/lib/routes";
import { DocumentsList } from "./documents-list";
import { useIssuedDocuments } from "./use-issued-documents";

export function DocumentsScreen() {
  const t = useTranslations("documents.list");
  const tCommon = useTranslations("common");
  const issued = useIssuedDocuments();

  const body = () => {
    if (issued.documents) {
      if (issued.documents.length === 0) {
        return (
          <EmptyState
            icon={FileTextIcon}
            message={t("empty")}
            action={
              <Button asChild>
                <Link href={routes.branding}>{t("emptyAction")}</Link>
              </Button>
            }
          />
        );
      }
      return (
        <div className="flex flex-col gap-4">
          <DocumentsList documents={issued.documents} />
          {issued.hasNextPage && (
            <Button
              variant="outline"
              className="self-center"
              disabled={issued.isFetchingNextPage}
              onClick={() => void issued.fetchNextPage()}
            >
              {issued.isFetchingNextPage ? t("loadingMore") : t("more")}
            </Button>
          )}
        </div>
      );
    }
    if (issued.isError) {
      return (
        <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void issued.refetch()} />
      );
    }
    return (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={tCommon("loading")} className="flex flex-col gap-2">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-14 w-full" />
          ))}
        </div>
      </Delayed>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackToSettings />
        <PageTitle>{t("title")}</PageTitle>
        <p className="max-w-[65ch] text-muted-foreground">{t("intro")}</p>
      </div>
      {body()}
    </div>
  );
}
