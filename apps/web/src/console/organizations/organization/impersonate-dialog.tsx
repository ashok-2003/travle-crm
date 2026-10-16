"use client";

// Support signing in as a member (spec 6.1, ADR 0019), asked once more: it is recorded in the organization's audit
// log and lasts an hour at most. Better Auth swaps the session cookie, then the agency's app opens with a full page
// load, so nothing of the console stays in memory; its banner offers Stop. A refusal says why and changes nothing.
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
import errors from "@/i18n/messages/en-IN/errors.json";
import { useErrorMessage } from "@/lib/error-message";
import { loadPage } from "@/lib/navigate";
import { routes } from "@/lib/routes";

type Failure = Extract<AuthResult<unknown>, { ok: false }>;

const isReason = (code: string): code is keyof typeof errors.reasons => Object.hasOwn(errors.reasons, code);

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
  const tErrors = useTranslations("errors");
  const { authError } = useErrorMessage();
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  /** The side door's own refusals (a target no longer active, a step still to take) in the console's words. */
  const refusal = (refused: Failure) => {
    if (refused.code === "IMPERSONATION_TARGET_NOT_A_MEMBER") return t("notAMember", { name: member.name });
    return isReason(refused.code) ? tErrors(`reasons.${refused.code}`) : authError(refused);
  };

  const start = async () => {
    setStarting(true);
    setFailure(null);
    const result = await authClient.impersonate({ userId: member.userId });
    if (result.ok) {
      loadPage(routes.home);
      return;
    }
    setFailure(result);
    setStarting(false);
  };

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) setFailure(null);
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
            <AlertDescription>{refusal(failure)}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
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
