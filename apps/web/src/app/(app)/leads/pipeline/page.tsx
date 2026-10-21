// /leads/pipeline: the open leads by stage, as a board (release C), for members whose role sees leads.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PipelineScreen } from "@/leads/pipeline/pipeline-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("leads.pipeline");
  return { title: t("title") };
}

export default function PipelinePage() {
  return (
    <RequirePermission permission="leads:view">
      <PipelineScreen />
    </RequirePermission>
  );
}
