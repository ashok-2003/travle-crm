"use client";

// The documents screen (spec 9.3): every document the organization has issued, newest first, a page at a time, with
// its PDF once the worker has made it. Today they are the samples the branding screen previews; quotes and invoices
// join them. A suspended organization's Owner reaches it too, so it offers no way into the screens shut to them.
import { FileTextIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BackToSettings } from "@/components/back-to-settings";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { ShowMoreButton } from "@/components/show-more-button";
import { Button } from "@/components/ui/button";
import { useScreenOpen } from "@/components/use-screen-open";
import { routes } from "@/lib/routes";
import { DocumentsList } from "./documents-list";
import { useIssuedDocuments } from "./use-issued-documents";

export function DocumentsScreen() {
  const t = useTranslations("documents.list");
  const tCommon = useTranslations("common");
  const issued = useIssuedDocuments();
  const brandingOpens = useScreenOpen(routes.branding);

  const body = () => {
    if (issued.items) {
      if (issued.items.length === 0) {
        return (
          <EmptyState
            icon={FileTextIcon}
            message={t("empty")}
            action={
              brandingOpens ? (
                <Button asChild>
                  <Link href={routes.branding}>{t("emptyAction")}</Link>
                </Button>
              ) : undefined
            }
          />
        );
      }
      return (
        <div className="flex flex-col gap-4">
          <DocumentsList documents={issued.items} />
          <ShowMoreButton pages={issued} label={t("more")} />
        </div>
      );
    }
    if (issued.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={issued.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void issued.refetch()}
        />
      );
    }
    return <LoadingRows rows={3} shape="twoLines" />;
  };

  return (
    <div className="flex flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} />
      {body()}
    </div>
  );
}
