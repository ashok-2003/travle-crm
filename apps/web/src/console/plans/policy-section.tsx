"use client";

// The subscription policy (spec 7.3, Q3), shown to all platform staff: how long a trial lasts when onboarding gives
// it no end, and how many days an unpaid organization stays past due, then read-only, before it is suspended. Super
// admins change it.
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Details } from "@/components/details";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount } from "@/lib/format";
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
        <Details
          rows={FIELDS.map((field) => ({
            label: t(field),
            value: (
              <span>
                <span className="numbers">{formatCount(days[field])}</span> {t("daysUnit", { count: days[field] })}
              </span>
            ),
          }))}
        />
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
