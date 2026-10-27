"use client";

// A lead page's AI insight (the AI sales agent): shown once the agent has scored the lead from its chat; nothing until then.
import { InsightCard } from "./insight-card";
import { useLeadInsight } from "./use-ai";

export function LeadInsight({ leadId }: { leadId: string }) {
  const insight = useLeadInsight(leadId).data?.insight ?? null;
  return insight === null ? null : <InsightCard insight={insight} />;
}
