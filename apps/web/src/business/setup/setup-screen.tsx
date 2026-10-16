"use client";

// The setup checklist screen (spec 7.1, spec 11): what an organization does first, how far along it is, and every step
// marked done or to do and leading to where it is done. Home's setup card lists the same steps' rows, those to do.
import { useTranslations } from "next-intl";
import { BackToSettings } from "@/components/back-to-settings";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { SetupProgress, SetupSteps } from "./setup-steps";
import { useSetupChecklist } from "./use-setup-checklist";

export function SetupScreen() {
  const t = useTranslations("business.setup");
  const tCommon = useTranslations("common");
  const checklist = useSetupChecklist();

  const body = () => {
    if (checklist.data) {
      return (
        <div className="flex flex-col gap-4">
          <SetupProgress checklist={checklist.data} />
          <SetupSteps checklist={checklist.data} />
          {checklist.data.done && <p>{t("allDone")}</p>}
        </div>
      );
    }
    if (checklist.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={checklist.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void checklist.refetch()}
        />
      );
    }
    return <LoadingRows rows={7} shape="twoLines" />;
  };

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} />
      {body()}
    </div>
  );
}
