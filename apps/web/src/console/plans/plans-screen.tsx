"use client";

// The console's plans (spec 7.2): those an organization can be put on, then the archived ones apart, and the
// subscription policy below. Super admins create, change and archive plans; support sees them all read-only and is
// told why (the console's api refuses support's changes anyway).
import { LayersIcon, LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { useWideScreen } from "@/lib/use-wide-screen";
import { isSuperAdmin, useStaff } from "../session/staff-context";
import { NewPlanButton } from "./plan-dialog";
import { PlansList } from "./plans-list";
import { PlansTable } from "./plans-table";
import { PolicySection } from "./policy-section";
import { usePlans } from "./use-plans";

export function PlansScreen() {
  const t = useTranslations("consolePlatform.plans");
  const tCommon = useTranslations("common");
  const editable = isSuperAdmin(useStaff());
  const wide = useWideScreen();
  const plans = usePlans();
  const Plans = wide ? PlansTable : PlansList;

  const body = () => {
    if (plans.data) {
      const current = plans.data.filter((plan) => !plan.archived);
      const archived = plans.data.filter((plan) => plan.archived);
      if (plans.data.length === 0) {
        return <EmptyState icon={LayersIcon} message={editable ? t("empty") : t("emptyReadOnly")} />;
      }
      return (
        <>
          {current.length > 0 && <Plans plans={current} editable={editable} />}
          {archived.length > 0 && (
            <section aria-labelledby="archived-plans" className="flex flex-col gap-3">
              <h2 id="archived-plans" className="text-section font-semibold">
                {t("archivedTitle")}
              </h2>
              <Plans plans={archived} editable={false} />
            </section>
          )}
        </>
      );
    }
    if (plans.isError) {
      return (
        <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void plans.refetch()} />
      );
    }
    return (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={t("loading")} className="flex flex-col gap-2">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-14 w-full" />
          ))}
        </div>
      </Delayed>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[65ch] flex-col gap-2">
          <PageTitle>{t("title")}</PageTitle>
          <p className="text-muted-foreground">{t("intro")}</p>
          {!editable && (
            <p className="flex items-center gap-2 text-label">
              <LockIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              {t("readOnly")}
            </p>
          )}
        </div>
        {editable && <NewPlanButton />}
      </div>
      <div className="flex flex-col gap-6">{body()}</div>
      <PolicySection />
    </div>
  );
}
