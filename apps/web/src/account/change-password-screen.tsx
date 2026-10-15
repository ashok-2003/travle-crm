"use client";

// /change-password: the first sign-in with a temporary password ends here (the CHANGE_PASSWORD step), and anyone may
// come here from their account. Afterwards the app asks the api what's next; other devices are signed out.
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Delayed } from "@/components/delayed";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/lib/routes";
import { ChangePasswordForm } from "./change-password-form";
import { useContinueAfterStep, useCurrentPerson } from "./current-person";

export function ChangePasswordScreen() {
  const t = useTranslations("account.changePassword");
  const me = useCurrentPerson();
  const router = useRouter();
  const continueAfterStep = useContinueAfterStep();

  if (!me.data) {
    return (
      <Delayed>
        <Skeleton className="h-64 w-full" />
      </Delayed>
    );
  }
  const pending = me.data.pendingStep === "CHANGE_PASSWORD";
  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{t("title")}</PageTitle>
      <p className="text-muted-foreground">{pending ? t("pendingIntro") : t("intro")}</p>
      <ChangePasswordForm
        temporary={pending}
        onChanged={async () => {
          if (pending) {
            await continueAfterStep();
            return;
          }
          toast.success(t("changed"));
          router.push(routes.account);
        }}
      />
    </div>
  );
}
