"use client";

// /change-password: the first sign-in with a temporary password ends here (the CHANGE_PASSWORD step, from the app or,
// with ?next=, the console), and anyone may come here from their account, and go back to it. Only a step that is due
// speaks of a temporary password; one the person was sent to has no way around. Afterwards the app asks the api what's
// next; other devices are signed out.
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PageTitle } from "@/components/page-title";
import { routes } from "@/lib/routes";
import { ChangePasswordForm } from "./change-password-form";
import { CurrentPersonGate, isStepDue, useContinueAfterStep, useReturnPath } from "./current-person";
import { TextLink } from "./text-link";

export function ChangePasswordScreen() {
  const t = useTranslations("account");
  const router = useRouter();
  const continueAfterStep = useContinueAfterStep();
  const returnPath = useReturnPath();

  return (
    <CurrentPersonGate>
      {(me) => {
        const due = isStepDue(me, "CHANGE_PASSWORD", returnPath);
        const sent = due || returnPath !== null;
        return (
          <div className="flex flex-col gap-6">
            <PageTitle>{t("changePassword.title")}</PageTitle>
            <p className="text-muted-foreground">
              {due ? t("changePassword.pendingIntro") : t("changePassword.intro")}
            </p>
            <ChangePasswordForm
              temporary={due}
              onChanged={async () => {
                if (sent) {
                  await continueAfterStep();
                  return;
                }
                toast.success(t("changePassword.changed"));
                router.push(routes.account);
              }}
            />
            {!sent && <TextLink href={routes.account}>{t("steps.backToAccount")}</TextLink>}
          </div>
        );
      }}
    </CurrentPersonGate>
  );
}
