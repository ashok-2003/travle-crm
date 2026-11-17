// /ai-agent: the AI agent's page (overview, setup, try it), for whoever manages the AI (Owner, Admin).
import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AgentScreen } from "@/ai/agent/agent-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("aiAgent");
  return { title: t("title") };
}

export default function AiAgentPage() {
  return (
    <RequirePermission permission="ai:manage">
      <Suspense>
        <AgentScreen />
      </Suspense>
    </RequirePermission>
  );
}
