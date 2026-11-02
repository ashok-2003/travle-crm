// /suppliers/<id>: one supplier, its contacts and costs (release 7a).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequirePermission } from "@/session/require-permission";
import { SupplierScreen } from "@/suppliers/supplier-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("suppliers.page");
  return { title: t("title") };
}

export default async function SupplierPage({ params }: PageProps<"/suppliers/[supplierId]">) {
  const { supplierId } = await params;
  return (
    <RequirePermission permission="suppliers:view">
      <SupplierScreen supplierId={supplierId} />
    </RequirePermission>
  );
}
