"use client";

// The console's plans (spec 7.2): those an organization can be put on, then the archived ones apart, and the
// subscription policy below. Super admins create, change and archive plans; support sees them all read-only and is
// told why (the console's api refuses support's changes anyway).
import { LayersIcon, LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { LoadingRows } from "@/components/loading-rows";
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
          {current.length > 0 ? (
            <Plans plans={current} editable={editable} />
          ) : (
            <EmptyState icon={LayersIcon} message={t("nothingOnSale")} />
          )}
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
    return <LoadingRows rows={3} label={t("loading")} />;
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("title")}
        intro={
          <>
            {t("intro")}
            {!editable && (
              <span className="mt-2 flex items-center gap-2 text-label text-foreground">
                <LockIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                {t("readOnly")}
              </span>
            )}
          </>
        }
        action={editable && <NewPlanButton />}
      />
      <div className="flex flex-col gap-6">{body()}</div>
      <PolicySection />
    </div>
  );
}
