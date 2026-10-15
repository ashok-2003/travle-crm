"use client";

// The setup checklist screen (spec 7.1, spec 11): what an organization does first, each step marked done or to do and
// leading to where it is done, and how far along it is.
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { SetupSteps, useSetupProgress } from "./setup-steps";
import { useSetupChecklist } from "./use-setup-checklist";

export function SetupScreen() {
  const t = useTranslations("business.setup");
  const tCommon = useTranslations("common");
  const checklist = useSetupChecklist();
  const progress = useSetupProgress();

  const body = () => {
    if (checklist.data) {
      return (
        <div className="flex flex-col gap-3">
          <p className="text-label text-muted-foreground">{progress(checklist.data)}</p>
          <SetupSteps checklist={checklist.data} />
          {checklist.data.done && <p>{t("allDone")}</p>}
        </div>
      );
    }
    if (checklist.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void checklist.refetch()}
        />
      );
    }
    return (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={tCommon("loading")} className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-14 w-full" />
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
