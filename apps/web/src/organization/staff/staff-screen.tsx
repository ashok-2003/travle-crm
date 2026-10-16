"use client";

// The staff screen (spec 6.3): who signs in to the organization and with which role, and adding, changing and
// removing them. It asks for the same staff list the navigation prefetches, so it usually opens with it. The roles are
// for adding staff and changing a role, both changes: where the subscription refuses changes (suspended, where the
// roles list is refused too), the list shows without them, for the Owner to take someone's access away (ADR 0021).
import { useQuery } from "@tanstack/react-query";
import { UsersIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { useTRPC } from "@/data/trpc";
import { useWriteAccess } from "@/subscription/write-access";
import { CreateStaffDialog } from "./create-staff-dialog";
import { StaffList } from "./staff-list";
import { LoadingRows } from "@/components/loading-rows";
import { useWideScreen } from "@/lib/use-wide-screen";

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
  const wide = useWideScreen();

  const body = () => {
    if (staff.data && shownRoles) {
      // The person looking is always on the list: with nobody else on it, the screen says what belongs here.
      return (
        <>
          <StaffList staff={staff.data} roles={shownRoles} />
          {staff.data.length <= 1 && (
            <EmptyState icon={UsersIcon} message={rolesNeeded ? t("empty") : t("emptyNoAdding")} />
          )}
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
    return wide ? <LoadingRows shape="table" columns={6} /> : <LoadingRows shape="twoLines" />;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        intro={t("intro")}
        action={shownRoles && <CreateStaffDialog roles={shownRoles} />}
      />
      {body()}
    </div>
  );
}
