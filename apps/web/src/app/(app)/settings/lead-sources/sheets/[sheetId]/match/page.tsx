// /settings/lead-sources/sheets/<sheetId>/match: a connected sheet's columns matched again (S15).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ConnectScreen } from "@/lead-sources/connect/connect-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sheets");
  return { title: t("sheet.matchAgain") };
}

export default async function MatchSheetColumnsPage({
  params,
}: PageProps<"/settings/lead-sources/sheets/[sheetId]/match">) {
  const { sheetId } = await params;
  return (
    <RequirePermission permission="leads:create">
      <RequirePermission permission="leads:assign">
        <ConnectScreen sheetId={sheetId} matchingAgain />
      </RequirePermission>
    </RequirePermission>
  );
}
