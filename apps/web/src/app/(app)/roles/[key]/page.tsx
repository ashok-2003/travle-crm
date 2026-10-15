// /roles/<key>: one role's name and permissions.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RoleEditorScreen } from "@/organization/roles/role-editor-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("roles");
  return { title: t("title") };
}

export default async function RolePage({ params }: PageProps<"/roles/[key]">) {
  const { key } = await params;
  return (
    <RequirePermission permission="roles:manage">
      <RoleEditorScreen roleKey={key} />
    </RequirePermission>
  );
}
