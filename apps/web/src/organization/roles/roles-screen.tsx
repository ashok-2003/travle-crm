"use client";

// The roles screen (spec 6.5): every role as a badge in its own colour (DESIGN.md "Role Badges", as on Staff), how many
// people have it and how much it allows, each opening its editor.
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { useTRPC } from "@/data/trpc";
import { routes } from "@/lib/routes";
import { CreateRoleDialog } from "./create-role-dialog";
import { RoleBadge } from "./role-badge";
import { LoadingRows } from "@/components/loading-rows";

export function RolesScreen() {
  const t = useTranslations("roles");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  // Always asked again when the screen opens: the copy restored from IndexedDB can predate a change just made.
  const roles = useQuery(trpc.roles.list.queryOptions());

  const body = () => {
    if (roles.data) {
      return (
        <ItemGroup>
          {roles.data.map((role, index) => (
            <Fragment key={role.key}>
              {index > 0 && <ItemSeparator />}
              <div role="listitem">
                <Item size="sm" asChild>
                  <Link href={`${routes.roles}/${role.key}`}>
                    <ItemContent>
                      <ItemTitle>
                        <RoleBadge role={role} isOwner={role.isOwner} className="text-sm" />
                      </ItemTitle>
                      <ItemDescription>
                        {role.isOwner ? t("everyPermission") : t("permissionCount", { count: role.permissions.length })}
                      </ItemDescription>
                    </ItemContent>
                    <span className="text-muted-foreground">{t("people", { count: role.memberCount })}</span>
                    <ChevronRightIcon aria-hidden="true" className="size-4" />
                  </Link>
                </Item>
              </div>
            </Fragment>
          ))}
        </ItemGroup>
      );
    }
    if (roles.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={roles.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void roles.refetch()}
        />
      );
    }
    return <LoadingRows rows={5} shape="twoLines" />;
  };

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro")} action={<CreateRoleDialog />} />
      {body()}
    </div>
  );
}
