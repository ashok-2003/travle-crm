"use client";

// /console/emails/<id>: one email as it was sent (the failed-emails spec), a super admin's alone: who it was for and
// from, what happened, the email itself in a sandboxed frame and its plain text, its resends, and Send again, asked
// once more. The outcome shows here, and the list and this page load again. An email no longer kept (purged after 30
// days, or a mistyped address) is said so, with the way back. Support is told the page is a super admin's.
import type { StoredEmail } from "@travel-crm/contracts/platform";
import { CircleAlertIcon, CircleCheckIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Details, type Detail } from "@/components/details";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useInstantText } from "@/components/instant-text";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/text-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { refusalOf } from "@/data/api-error";
import { consoleRoutes } from "../routes";
import { isSuperAdmin, useStaff } from "../session/staff-context";
import { EmailAsSent } from "./email-as-sent";
import { EmailResends } from "./email-resends";
import { useEmailWords } from "./email-words";
import { useResendEmail, useStoredEmail } from "./use-failed-emails";

function useDetailRows(email: StoredEmail): Detail[] {
  const t = useTranslations("consolePlatform.emails.email");
  const instantText = useInstantText();
  const words = useEmailWords();
  const time = (iso: string | null): Detail["value"] => (iso === null ? undefined : instantText(iso));
  const rows: (Detail | null)[] = [
    { label: t("to"), value: email.toName === null ? email.toAddress : `${email.toName} <${email.toAddress}>` },
    { label: t("fromName"), value: email.fromName },
    { label: t("replyTo"), value: email.replyTo ?? t("noReplyTo") },
    { label: t("purpose"), value: words.purpose(email.purpose) },
    { label: t("createdAt"), value: time(email.createdAt) },
    email.sentAt === null ? null : { label: t("sentAt"), value: time(email.sentAt) },
    email.failedAt === null ? null : { label: t("failedAt"), value: time(email.failedAt) },
    email.failureSource === null
      ? null
      : {
          label: t("failure"),
          value: words.source(email.failureSource),
          info: words.sourceMeaning(email.failureSource),
        },
    email.failureCode === null
      ? null
      : { label: t("code"), value: <span className="numbers break-all">{email.failureCode}</span> },
    email.failureReason === null ? null : { label: t("reason"), value: email.failureReason },
  ];
  return rows.filter((row) => row !== null);
}

function Email({ email }: { email: StoredEmail }) {
  const t = useTranslations("consolePlatform.emails");
  const rows = useDetailRows(email);
  const [asking, setAsking] = useState(false);
  const resendButton = useRef<HTMLButtonElement>(null);
  const resend = useResendEmail(() => {
    setAsking(false);
  });
  const outcome = resend.data;
  return (
    <>
      <PageHeader
        title={<span className="wrap-anywhere">{email.subject}</span>}
        intro={<span className="wrap-anywhere">{email.toAddress}</span>}
        action={
          email.status === "failed" && (
            <Button
              ref={resendButton}
              onClick={() => {
                setAsking(true);
              }}
            >
              {t("resend.button")}
            </Button>
          )
        }
      />
      {outcome !== undefined && (
        <Alert role="status" variant={outcome.status === "sent" ? "default" : "destructive"}>
          {outcome.status === "sent" ? <CircleCheckIcon aria-hidden="true" /> : <CircleAlertIcon aria-hidden="true" />}
          <AlertDescription>
            {t(
              outcome.status === "failed" ? "resend.failed" : outcome.id === null ? "resend.unrecorded" : "resend.sent",
            )}
          </AlertDescription>
        </Alert>
      )}
      <section aria-labelledby="email-details" className="flex flex-col gap-3">
        <h2 id="email-details" className="text-section font-semibold">
          {t("email.details")}
        </h2>
        <Details rows={rows} />
      </section>
      <EmailAsSent email={email} />
      <section aria-labelledby="email-resends" className="flex flex-col gap-3">
        <h2 id="email-resends" className="text-section font-semibold">
          {t("email.resends")}
        </h2>
        <EmailResends resends={email.resends} />
      </section>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        returnFocusTo={resendButton}
        destructive={false}
        title={t("resend.title")}
        description={t("resend.description", { address: email.toAddress })}
        action={t("resend.confirm")}
        request={resend}
        onConfirm={() => {
          resend.mutate({ id: email.id });
        }}
      />
    </>
  );
}

function EmailOrState({ emailId }: { emailId: string }) {
  const t = useTranslations("consolePlatform.emails.email");
  const tCommon = useTranslations("common");
  const email = useStoredEmail(emailId);
  if (email.data) return <Email email={email.data} />;
  const status = refusalOf(email.error)?.status;
  // A malformed id is refused as invalid input: to the person, both are no such email.
  if (status === 404 || status === 400) {
    return (
      <EmptyState
        icon={SearchXIcon}
        message={t("notFound")}
        action={
          <Button asChild variant="outline">
            <Link href={consoleRoutes.emails}>{t("back")}</Link>
          </Button>
        }
      />
    );
  }
  return email.isError ? (
    <ErrorState
      message={t("loadFailed")}
      error={email.error}
      retryLabel={tCommon("tryAgain")}
      onRetry={() => void email.refetch()}
    />
  ) : (
    <LoadingRows rows={4} shape="twoLines" label={t("loading")} />
  );
}

export function EmailScreen({ emailId }: { emailId: string }) {
  const t = useTranslations("consolePlatform.emails");
  const superAdmin = isSuperAdmin(useStaff());
  return (
    <div className="flex max-w-[960px] flex-col gap-8">
      <BackLink href={consoleRoutes.emails} label={t("email.back")} />
      {superAdmin ? <EmailOrState emailId={emailId} /> : <p>{t("superAdminsOnly")}</p>}
    </div>
  );
}
