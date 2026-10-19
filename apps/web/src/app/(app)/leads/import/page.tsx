// /leads/import: choosing the file of a lead import (spec 3.2 step 1), for members who may add leads and give them to
// others (leads:create and leads:assign), as the api asks of every step.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ChooseFileScreen } from "@/leads/import/choose-file-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("leads.import");
  return { title: t("title") };
}

export default function LeadImportPage() {
  return (
    <RequirePermission permission="leads:create">
      <RequirePermission permission="leads:assign">
        <ChooseFileScreen />
      </RequirePermission>
    </RequirePermission>
  );
}
