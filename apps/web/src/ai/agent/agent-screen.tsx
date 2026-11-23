"use client";

// /ai-agent: the AI agent's own page, the full width: its state beside the title, Setup (a page of its own) at the top
// right, and two tabs, Overview (with each WhatsApp number's AI switch, once there are two) and Try it (?tab=try). An old
// ?tab=setup address opens the Setup page, at its step.
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { routes } from "@/lib/routes";
import { TestSection } from "../test-section";
import { AgentOverview } from "./agent-overview";
import { AgentStateBadge, SetupButton } from "./agent-state";
import { NumberSwitches } from "./number-switches";

const tabs = ["overview", "try"] as const;
type AgentTab = (typeof tabs)[number];

const tabOf = (value: string | null): AgentTab => tabs.find((tab) => tab === value) ?? "overview";

export function AgentScreen() {
  const t = useTranslations("aiAgent");
  const router = useRouter();
  const asked = useSearchParams().get("tab");
  const tab = tabOf(asked);
  useEffect(() => {
    // Links made before Setup had its own page ("?tab=setup#step-payment") still reach it, at the step they named.
    if (asked === "setup") router.replace(`${routes.aiAgentSetup}${window.location.hash}`);
  }, [asked, router]);
  // On its way to Setup: nothing to show, and nothing of the overview's to ask for.
  if (asked === "setup") return null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} status={<AgentStateBadge />} intro={t("intro")} action={<SetupButton />} />
      <Tabs
        value={tab}
        onValueChange={(next) => {
          router.replace(tabOf(next) === "try" ? `${routes.aiAgent}?tab=try` : routes.aiAgent);
        }}
      >
        <TabsList aria-label={t("tabs.label")}>
          {tabs.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(`tabs.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="flex flex-col gap-6 pt-4">
          <AgentOverview />
          <NumberSwitches />
        </TabsContent>
        <TabsContent value="try" className="pt-4">
          <TestSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
