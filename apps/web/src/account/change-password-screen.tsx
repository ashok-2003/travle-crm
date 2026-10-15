"use client";

// /change-password: the first sign-in with a temporary password ends here (the CHANGE_PASSWORD step), and anyone may
// come here from their account, and go back to it. Afterwards the app asks the api what's next; other devices are
// signed out.
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PageTitle } from "@/components/page-title";
import { routes } from "@/lib/routes";
import { ChangePasswordForm } from "./change-password-form";
import { CurrentPersonGate, useContinueAfterStep } from "./current-person";
import { TextLink } from "./text-link";

export function ChangePasswordScreen() {
  const t = useTranslations("account");
  const router = useRouter();
  const continueAfterStep = useContinueAfterStep();

  return (
    <CurrentPersonGate>
      {(me) => {
        const pending = me.pendingStep === "CHANGE_PASSWORD";
        return (
          <div className="flex flex-col gap-6">
            <PageTitle>{t("changePassword.title")}</PageTitle>
            <p className="text-muted-foreground">
              {pending ? t("changePassword.pendingIntro") : t("changePassword.intro")}
            </p>
            <ChangePasswordForm
              temporary={pending}
              onChanged={async () => {
                if (pending) {
                  await continueAfterStep();
                  return;
                }
                toast.success(t("changePassword.changed"));
                router.push(routes.account);
              }}
            />
            {!pending && <TextLink href={routes.account}>{t("steps.backToAccount")}</TextLink>}
          </div>
        );
      }}
    </CurrentPersonGate>
  );
}
