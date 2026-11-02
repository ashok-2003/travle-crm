"use client";

// The console's failed emails (the owner, 2026-11-02; the failed-emails spec), a super admin's alone: the emails of the
// last 30 days that never reached their person, our own failed sends and the ones the email provider dropped, newest
// first, a page at a time, each opening as it was sent. Support never sees it in the navigation; opening it says it is
// a super admin's, and asks nothing of the api, which would refuse.
import { MailCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { ShowMoreButton } from "@/components/show-more-button";
import { useWideScreen } from "@/lib/use-wide-screen";
import { isSuperAdmin, useStaff } from "../session/staff-context";
import { FailedEmailsList } from "./failed-emails-list";
import { FailedEmailsTable } from "./failed-emails-table";
import { useFailedEmails } from "./use-failed-emails";

function FailedEmails() {
  const t = useTranslations("consolePlatform.emails");
  const tCommon = useTranslations("common");
  const wide = useWideScreen();
  const failed = useFailedEmails();
  const emails = failed.items;
  if (emails === undefined) {
    return failed.isError ? (
      <ErrorState
        message={t("loadFailed")}
        error={failed.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void failed.refetch()}
      />
    ) : (
      <LoadingRows rows={3} shape={wide ? "table" : "twoLines"} columns={5} label={t("loading")} />
    );
  }
  if (emails.length === 0) return <EmptyState icon={MailCheckIcon} message={t("empty")} />;
  return (
    <>
      {wide ? <FailedEmailsTable emails={emails} /> : <FailedEmailsList emails={emails} />}
      <ShowMoreButton pages={failed} label={t("showMore")} />
    </>
  );
}

export function FailedEmailsScreen() {
  const t = useTranslations("consolePlatform.emails");
  const superAdmin = isSuperAdmin(useStaff());
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro")} />
      {superAdmin ? <FailedEmails /> : <p>{t("superAdminsOnly")}</p>}
    </div>
  );
}
