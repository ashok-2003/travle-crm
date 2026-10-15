// /settings/audit: the organization's audit log, for members whose role may read it. It has its own navigation item,
// because /settings itself needs settings:manage.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuditScreen } from "@/audit/audit-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("audit");
  return { title: t("title") };
}

export default function AuditPage() {
  return (
    <RequirePermission permission="audit:view">
      {/* The screen reads the record whose history to show from the address, which only the browser knows. */}
      <Suspense>
        <AuditScreen />
      </Suspense>
    </RequirePermission>
  );
}
