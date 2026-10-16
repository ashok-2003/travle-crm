"use client";

// The business profile screen (spec 7.1): what onboarding saved, for the Owner to complete, and what the setup
// checklist's business details, bank details and invoice prefix steps lead to.
import { useTranslations } from "next-intl";
import { BackToSettings } from "@/components/back-to-settings";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
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
        <ErrorState
          message={t("loadFailed")}
          error={profile.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void profile.refetch()}
        />
      );
    }
    return <LoadingRows rows={5} shape="twoLines" />;
  };

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} />
      {body()}
    </div>
  );
}
