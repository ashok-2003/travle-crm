"use client";

// The Owner's home, until the organization is set up (spec 7.1: the Owner lands on the setup checklist): the
// checklist's steps and how far along they are, and once every step is done, the home it shows otherwise. While the
// checklist loads, or if it didn't, that usual home shows under its place, so the way to every screen is never hidden.
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { useMe } from "@/session/me-context";
import { SetupSteps, useSetupProgress } from "./setup-steps";
import { useSetupChecklist } from "./use-setup-checklist";

export function HomeChecklist({ afterwards }: { afterwards: ReactNode }) {
  const t = useTranslations("business.setup");
  const tCommon = useTranslations("common");
  const me = useMe();
  const checklist = useSetupChecklist();
  const progress = useSetupProgress();

  if (checklist.data?.done) return afterwards;
  if (checklist.data) {
    return (
      <section aria-labelledby="setup-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="setup-heading" className="text-section font-semibold">
            {t("homeHeading", { organization: me.organization.name })}
          </h2>
          <p className="text-label text-muted-foreground">{progress(checklist.data)}</p>
        </div>
        <SetupSteps checklist={checklist.data} />
      </section>
    );
  }
  if (checklist.isError) {
    return (
      <>
        <ErrorState
          message={t("loadFailed")}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void checklist.refetch()}
        />
        {afterwards}
      </>
    );
  }
  return (
    <>
      <LoadingRows rows={5} shape="twoLines" />
      {afterwards}
    </>
  );
}
