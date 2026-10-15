"use client";

// /roles/<key>: one role in the editor. The role comes from the roles list (there is no single-role call), so the
// list screen and the editor share one cached answer.
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/data/trpc";
import { routes } from "@/lib/routes";
import { RoleEditor } from "./role-editor";

export function RoleEditorScreen({ roleKey }: { roleKey: string }) {
  const t = useTranslations("roles");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  // An editor starts from the api's latest answer: a copy restored from IndexedDB can be a few seconds older than a
  // save just made, and saving from it would undo that save.
  const roles = useQuery({ ...trpc.roles.list.queryOptions(), refetchOnMount: "always" });
  const catalog = useQuery(trpc.roles.permissionCatalog.queryOptions());
  const role = roles.data?.find((entry) => entry.key === roleKey);

  const body = () => {
    if (roles.data && catalog.data) {
      // Keyed by what the role holds, so the editor starts again from the saved role when it changes: when the cached
      // copy shown first is replaced by the api's answer, or someone else changes it.
      return role ? (
        <RoleEditor
          key={`${role.key}:${role.name}:${JSON.stringify(role.permissions)}`}
          role={role}
          catalog={catalog.data}
        />
      ) : (
        <EmptyState icon={SearchXIcon} message={t("editor.notFound")} />
      );
    }
    if (roles.isError || catalog.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => {
            void roles.refetch();
            void catalog.refetch();
          }}
        />
      );
    }
    return (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={tCommon("loading")} className="flex flex-col gap-4">
          <Skeleton className="h-11 w-full max-w-sm" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Delayed>
    );
  };

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <Link href={routes.roles} className="flex min-h-11 w-fit items-center gap-2 text-primary hover:underline">
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t("editor.back")}
      </Link>
      <PageTitle>{role?.name ?? t("title")}</PageTitle>
      {body()}
    </div>
  );
}
