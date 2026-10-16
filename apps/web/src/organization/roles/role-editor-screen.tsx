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
import { Button } from "@/components/ui/button";
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
  const roles = useQuery(trpc.roles.list.queryOptions());
  const catalog = useQuery(trpc.roles.permissionCatalog.queryOptions());
  const role = roles.data?.find((entry) => entry.key === roleKey);

  const body = () => {
    if (roles.data && catalog.data) {
      // Keyed by the role only: when its saved content changes under the editor (the cached copy replaced by the api's
      // answer, someone else's save) the editor follows it, or warns if the person has unsaved edits.
      return role ? (
        <RoleEditor key={role.key} role={role} catalog={catalog.data} />
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
      <Button variant="link" className="self-start px-0" asChild>
        <Link href={routes.roles}>
          <ArrowLeftIcon aria-hidden="true" />
          {t("editor.back")}
        </Link>
      </Button>
      <PageTitle>{role?.name ?? t("title")}</PageTitle>
      {body()}
    </div>
  );
}
