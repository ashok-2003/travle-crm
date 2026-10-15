"use client";

// The roles screen (spec 6.5): every role, how many people have it and how much it allows, each opening its editor.
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/data/trpc";
import { routes } from "@/lib/routes";
import { CreateRoleDialog } from "./create-role-dialog";

export function RolesScreen() {
  const t = useTranslations("roles");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  // Always asked again when the screen opens: the copy restored from IndexedDB can predate a change just made.
  const roles = useQuery({ ...trpc.roles.list.queryOptions(), refetchOnMount: "always" });

  const body = () => {
    if (roles.data) {
      return (
        <ul className="divide-y rounded-lg border">
          {roles.data.map((role) => (
            <li key={role.key}>
              <Link
                href={`${routes.roles}/${role.key}`}
                className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-accent"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-medium break-words">{role.name}</span>
                  <span className="text-label text-muted-foreground">
                    {role.isOwner ? t("everyPermission") : t("permissionCount", { count: role.permissions.length })}
                  </span>
                </span>
                <span className="numbers text-muted-foreground">{t("people", { count: role.memberCount })}</span>
                <ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      );
    }
    if (roles.isError) {
      return (
        <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void roles.refetch()} />
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[65ch] flex-col gap-2">
          <PageTitle>{t("title")}</PageTitle>
          <p className="text-muted-foreground">{t("intro")}</p>
        </div>
        <CreateRoleDialog />
      </div>
      {body()}
    </div>
  );
}
