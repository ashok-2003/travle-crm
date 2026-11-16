// /console/organizations/<id>/ai-traces: the lite agent's turns in one agency, a super admin's. ?chat=<conversation id>
// narrows it to one chat; the server reads only the ids, never the agency's data, and ignores a chat that isn't a UUID.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AiTracesScreen } from "@/console/ai/ai-traces-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consoleAi.traces");
  return { title: t("title") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AiTracesPage({
  params,
  searchParams,
}: PageProps<"/console/organizations/[organizationId]/ai-traces">) {
  const { organizationId } = await params;
  const { chat } = await searchParams;
  return (
    <AiTracesScreen
      organizationId={organizationId}
      conversationId={typeof chat === "string" && UUID.test(chat) ? chat : null}
    />
  );
}
