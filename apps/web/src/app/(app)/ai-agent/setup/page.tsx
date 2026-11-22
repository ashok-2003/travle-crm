// /ai-agent/setup: what the AI agent needs before it answers, step by step, and its switch, for whoever manages the AI.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AgentSetupScreen } from "@/ai/agent/agent-setup";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("aiAgent.setup");
  return { title: t("title") };
}

export default function AiAgentSetupPage() {
  return (
    <RequirePermission permission="ai:manage">
      <AgentSetupScreen />
    </RequirePermission>
  );
}
