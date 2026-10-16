"use client";

// The subscription policy (spec 7.3, Q3), shown to all platform staff: how long a trial lasts when onboarding gives
// it no end, and how many days an unpaid organization stays past due, then read-only, before it is suspended. Super
// admins change it.
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isSuperAdmin, useStaff } from "../session/staff-context";
import { PolicyDialog } from "./policy-dialog";
import type { PolicyField } from "./policy-values";
import { usePolicy } from "./use-policy";

const FIELDS: readonly PolicyField[] = ["trialDays", "pastDueDays", "readOnlyDays"];

export function PolicySection() {
  const t = useTranslations("consolePlatform.policy");
  const tCommon = useTranslations("common");
  const editable = isSuperAdmin(useStaff());
  const policy = usePolicy();
  const [changing, setChanging] = useState(false);

  const body = () => {
    if (policy.data) {
      const days = policy.data;
      return (
        <dl className="grid divide-y rounded-lg border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {FIELDS.map((field) => (
            <div key={field} className="flex flex-col gap-1 px-4 py-3">
              <dt className="text-label text-muted-foreground">{t(field)}</dt>
              <dd className="numbers">{t("days", { count: days[field] })}</dd>
            </div>
          ))}
        </dl>
      );
    }
    if (policy.isError) {
      return (
        <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void policy.refetch()} />
      );
    }
    return <Skeleton role="status" aria-busy="true" aria-label={t("loading")} className="h-16 w-full" />;
  };

  return (
    <section aria-labelledby="subscription-policy" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[65ch] flex-col gap-1">
          <h2 id="subscription-policy" className="text-section font-semibold">
            {t("title")}
          </h2>
          <p className="text-muted-foreground">{t("intro")}</p>
        </div>
        {editable && policy.data && (
          <Button
            variant="outline"
            onClick={() => {
              setChanging(true);
            }}
          >
            {t("change")}
          </Button>
        )}
      </div>
      {body()}
      {policy.data && <PolicyDialog policy={policy.data} open={changing} onOpenChange={setChanging} />}
    </section>
  );
}
