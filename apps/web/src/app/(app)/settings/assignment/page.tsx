// /settings/assignment: who the leads that arrive by themselves go to (release C), for roles that manage settings.
import { features } from "@travel-crm/contracts/features";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AssignmentScreen } from "@/crm-settings/assignment/assignment-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.assignment");
  return { title: t("title") };
}

export default function AssignmentPage() {
  if (!features.automaticAssignment) notFound();
  return (
    <RequirePermission permission="settings:manage">
      <AssignmentScreen />
    </RequirePermission>
  );
}
