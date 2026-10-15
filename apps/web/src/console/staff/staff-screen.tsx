"use client";

// The console's platform staff (spec 5, 6.1; ADR 0019), a super admin's alone: everyone on the platform staff, with
// their level and whether they can use the console yet, adding someone, and the removed apart. Support never sees it
// in the navigation; opening it says it is a super admin's, and asks nothing of the api, which would refuse.
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { useWideScreen } from "@/lib/use-wide-screen";
import { isSuperAdmin, useStaff } from "../session/staff-context";
import { AddStaffDialog } from "./add-staff-dialog";
import { StaffList } from "./staff-list";
import { StaffTable } from "./staff-table";
import { usePlatformStaff } from "./use-platform-staff";

function StaffLists() {
  const t = useTranslations("consolePlatform.staff");
  const tCommon = useTranslations("common");
  const wide = useWideScreen();
  const staff = usePlatformStaff();
  const People = wide ? StaffTable : StaffList;
  if (staff.data) {
    const current = staff.data.filter((person) => person.level !== null);
    const removed = staff.data.filter((person) => person.level === null);
    return (
      <>
        <People people={current} />
        {removed.length > 0 && (
          <section aria-labelledby="removed-staff" className="flex flex-col gap-3">
            <h2 id="removed-staff" className="text-section font-semibold">
              {t("removedTitle")}
            </h2>
            <People people={removed} removed />
          </section>
        )}
      </>
    );
  }
  if (staff.isError) {
    return (
      <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void staff.refetch()} />
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
}

export function StaffScreen() {
  const t = useTranslations("consolePlatform.staff");
  const tErrors = useTranslations("errors");
  const superAdmin = isSuperAdmin(useStaff());
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[65ch] flex-col gap-2">
          <PageTitle>{t("title")}</PageTitle>
          <p className="text-muted-foreground">{t("intro")}</p>
        </div>
        {superAdmin && <AddStaffDialog />}
      </div>
      {superAdmin ? <StaffLists /> : <p>{tErrors("reasons.SUPER_ADMIN_ONLY")}</p>}
    </div>
  );
}
