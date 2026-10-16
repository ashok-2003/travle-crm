"use client";

// The staff screen (spec 6.3): who signs in to the organization and with which role, and adding, changing and
// removing them. It asks for the same staff list the navigation prefetches, so it usually opens with it. The roles are
// for adding staff and changing a role, both changes: where the subscription refuses changes (suspended, where the
// roles list is refused too), the list shows without them, for the Owner to take someone's access away (ADR 0021).
import { useQuery } from "@tanstack/react-query";
import { UsersIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/data/trpc";
import { useWriteAccess } from "@/subscription/write-access";
import { CreateStaffDialog } from "./create-staff-dialog";
import { StaffList } from "./staff-list";

export function StaffScreen() {
  const t = useTranslations("staff");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  // Always asked again when the screen opens: the copy restored from IndexedDB after a reload can predate a change
  // made a moment earlier, such as someone just removed.
  const staff = useQuery(trpc.staff.list.queryOptions());
  const roles = useQuery(trpc.roles.list.queryOptions());
  const rolesNeeded = useWriteAccess().allowed;
  const shownRoles = roles.data ?? (rolesNeeded ? undefined : []);

  const body = () => {
    if (staff.data && shownRoles) {
      // The person looking is always on the list: with nobody else on it, the screen says what belongs here.
      return (
        <>
          <StaffList staff={staff.data} roles={shownRoles} />
          {staff.data.length <= 1 && <EmptyState icon={UsersIcon} message={t("empty")} />}
        </>
      );
    }
    if (staff.isError || (rolesNeeded && roles.isError)) {
      return (
        <ErrorState
          message={t("loadFailed")}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => {
            void staff.refetch();
            void roles.refetch();
          }}
        />
      );
    }
    return (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={tCommon("loading")} className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-14 w-full" />
          ))}
        </div>
      </Delayed>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[65ch] flex-col gap-2">
          <PageTitle>{t("title")}</PageTitle>
          <p className="text-muted-foreground">{t("intro")}</p>
        </div>
        {shownRoles && <CreateStaffDialog roles={shownRoles} />}
      </div>
      {body()}
    </div>
  );
}
