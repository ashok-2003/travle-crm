// /suppliers: the hotels, transport operators and guides the agency buys from (release 7a).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequirePermission } from "@/session/require-permission";
import { SuppliersScreen } from "@/suppliers/suppliers-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("suppliers.list");
  return { title: t("title") };
}

export default function SuppliersPage() {
  return (
    <RequirePermission permission="suppliers:view">
      <SuppliersScreen />
    </RequirePermission>
  );
}
