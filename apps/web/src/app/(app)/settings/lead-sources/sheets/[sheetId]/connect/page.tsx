// /settings/lead-sources/sheets/<sheetId>/connect: a sheet's connect steps after the first, wherever it stopped.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ConnectScreen } from "@/lead-sources/connect/connect-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sheets");
  return { title: t("connect.title") };
}

export default async function ConnectSheetStepPage({
  params,
}: PageProps<"/settings/lead-sources/sheets/[sheetId]/connect">) {
  const { sheetId } = await params;
  return (
    <RequirePermission permission="leads:create">
      <RequirePermission permission="leads:assign">
        <ConnectScreen sheetId={sheetId} />
      </RequirePermission>
    </RequirePermission>
  );
}
