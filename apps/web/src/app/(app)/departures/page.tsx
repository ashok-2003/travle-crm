// /departures: the group batches by date, with their seats (release 7a).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DeparturesScreen } from "@/departures/departures-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("departures.list");
  return { title: t("title") };
}

export default function DeparturesPage() {
  return (
    <RequirePermission permission="departures:view">
      <DeparturesScreen />
    </RequirePermission>
  );
}
