"use client";

// The business profile screen (spec 7.1): what onboarding saved, for the Owner to complete, and what the setup
// checklist's business details, bank details and invoice prefix steps lead to.
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileForm } from "./profile-form";
import { useProfile } from "./use-profile";

export function ProfileScreen() {
  const t = useTranslations("business.profile");
  const tCommon = useTranslations("common");
  const profile = useProfile();

  const body = () => {
    if (profile.isSuccess) return <ProfileForm profile={profile.data} />;
    if (profile.isError) {
      return (
        <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void profile.refetch()} />
      );
    }
    return (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={tCommon("loading")} className="flex flex-col gap-4">
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-16 w-full" />
          ))}
        </div>
      </Delayed>
    );
  };

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <div className="flex max-w-[65ch] flex-col gap-2">
        <PageTitle>{t("title")}</PageTitle>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      {body()}
    </div>
  );
}
