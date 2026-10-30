// /suppliers/dues: what the agency owes its suppliers (release 7a).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequirePermission } from "@/session/require-permission";
import { DuesScreen } from "@/suppliers/dues-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("suppliers.dues");
  return { title: t("title") };
}

export default function DuesPage() {
  return (
    <RequirePermission permission="accounts:view">
      <DuesScreen />
    </RequirePermission>
  );
}
