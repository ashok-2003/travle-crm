// /settings/blocked-contacts: the contacts blocked from leads, unblocked here, for roles that may reassign leads
// (spec 3.6, R17).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BlockedContactsScreen } from "@/crm-settings/blocked-contacts-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("blockedContacts.title") };
}

export default function BlockedContactsPage() {
  return (
    <RequirePermission permission="leads:assign">
      <BlockedContactsScreen />
    </RequirePermission>
  );
}
