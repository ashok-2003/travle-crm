// /settings/lead-sources/sheets/<sheetId>: one connected sheet, its counts, the rows that couldn't be added and its controls.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SheetScreen } from "@/lead-sources/sheet/sheet-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sheets");
  return { title: t("list.heading") };
}

export default async function SheetPage({ params }: PageProps<"/settings/lead-sources/sheets/[sheetId]">) {
  const { sheetId } = await params;
  return (
    <RequirePermission permission="leads:create">
      <RequirePermission permission="leads:assign">
        <SheetScreen sheetId={sheetId} />
      </RequirePermission>
    </RequirePermission>
  );
}
