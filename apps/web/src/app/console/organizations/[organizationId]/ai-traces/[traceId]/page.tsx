// /console/organizations/<id>/ai-traces/<traceId>: one lite agent turn, whole, a super admin's. The server reads only
// the two ids; opening the turn is the browser's one call, and the platform log records it.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AiTraceScreen } from "@/console/ai/ai-trace-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consoleAi.trace");
  return { title: t("title") };
}

export default async function AiTracePage({
  params,
}: PageProps<"/console/organizations/[organizationId]/ai-traces/[traceId]">) {
  const { organizationId, traceId } = await params;
  return <AiTraceScreen organizationId={organizationId} traceId={traceId} />;
}
