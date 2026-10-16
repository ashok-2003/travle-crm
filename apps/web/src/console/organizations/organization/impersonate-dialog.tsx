"use client";

// Support signing in as a member (spec 6.1, ADR 0019), asked once more: it is recorded in the organization's audit
// log and lasts an hour at most. Better Auth swaps the session cookie; the device's other tabs are told, as at a
// sign-out, since the session is no longer support's; then the agency's app opens with a full page load, so nothing
// of the console stays in memory, and its banner offers Stop. While Better Auth answers, the dialog stays open; a
// refusal says why (the side door's in our own words) and changes nothing.
import type { OrganizationMember } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthResult } from "@/data/auth-client";
import { announceSignOut } from "@/data/session";
import { useErrorMessage } from "@/lib/error-message";
import { loadPage } from "@/lib/navigate";
import { reportProblem } from "@/lib/report-problem";
import { routes } from "@/lib/routes";

type Failure = Extract<AuthResult<unknown>, { ok: false }>;

export function ImpersonateDialog({
  member,
  organizationName,
}: {
  member: OrganizationMember;
  organizationName: string;
}) {
  const t = useTranslations("consoleOrganizations.impersonate");
  const tMembers = useTranslations("consoleOrganizations.members");
  const tCommon = useTranslations("common");
  const { authError } = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const start = async () => {
    setStarting(true);
    setFailure(null);
    const result = await authClient.impersonate({ userId: member.userId });
    if (result.ok) {
      // As signOut does: the session has changed already, so a tab left untold mustn't stop the page load.
      try {
        announceSignOut();
      } catch (error) {
        reportProblem(error);
      }
      loadPage(routes.home);
      return;
    }
    setFailure(result);
    setStarting(false);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (starting) return;
        setOpen(next);
        setFailure(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline">{tMembers("impersonate", { name: member.name })}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title", { name: member.name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("description", { name: member.name, organization: organizationName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failure && (
          <Alert variant="destructive">
            <AlertDescription>
              {failure.code === "IMPERSONATION_TARGET_NOT_A_MEMBER"
                ? t("notAMember", { name: member.name })
                : authError(failure)}
            </AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={starting}>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={starting}
            onClick={(event) => {
              // Stay open until Better Auth answers, so a refusal is shown here.
              event.preventDefault();
              void start();
            }}
          >
            {starting && <Spinner />}
            {starting ? t("starting") : t("confirm", { name: member.name })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
