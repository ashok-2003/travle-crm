// /settings/assignment: who the leads that arrive by themselves go to (release C), for roles that manage settings.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AssignmentScreen } from "@/crm-settings/assignment/assignment-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.assignment");
  return { title: t("title") };
}

export default function AssignmentPage() {
  return (
    <RequirePermission permission="settings:manage">
      <AssignmentScreen />
    </RequirePermission>
  );
}
