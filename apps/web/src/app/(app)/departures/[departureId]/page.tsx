// /departures/<id>: one batch, its seats, rooming list and costs (release 7a).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DepartureScreen } from "@/departures/departure-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("departures.page");
  return { title: t("title") };
}

export default async function DeparturePage({ params }: PageProps<"/departures/[departureId]">) {
  const { departureId } = await params;
  return (
    <RequirePermission permission="departures:view">
      <DepartureScreen departureId={departureId} />
    </RequirePermission>
  );
}
