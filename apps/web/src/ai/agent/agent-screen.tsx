"use client";

// /ai-agent: the AI agent's own page, in three tabs (Overview, Setup, Try it); the open tab is kept in the address as ?tab=.
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { routes } from "@/lib/routes";
import { TestSection } from "../test-section";
import { AgentOverview } from "./agent-overview";
import { AgentSetupTab } from "./agent-setup";

const tabs = ["overview", "setup", "try"] as const;
type AgentTab = (typeof tabs)[number];

const tabOf = (value: string | null): AgentTab => tabs.find((tab) => tab === value) ?? "overview";

export function AgentScreen() {
  const t = useTranslations("aiAgent");
  const router = useRouter();
  const tab = tabOf(useSearchParams().get("tab"));
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro")} />
      <Tabs
        value={tab}
        onValueChange={(next) => {
          router.replace(`${routes.aiAgent}?tab=${tabOf(next)}`);
        }}
      >
        <TabsList aria-label={t("tabs.label")}>
          {tabs.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(`tabs.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="pt-4">
          <AgentOverview />
        </TabsContent>
        <TabsContent value="setup" className="pt-4">
          <AgentSetupTab />
        </TabsContent>
        <TabsContent value="try" className="pt-4">
          <TestSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
