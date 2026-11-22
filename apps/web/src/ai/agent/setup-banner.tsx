"use client";

// The Overview's first card while the agent isn't answering for want of setup (off, or on but not ready): an amber card
// that says how many steps are left, names them once, and leads to Setup. Support's pause is the state badge's to say.
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { cardTints } from "@/components/card-tints";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { routes } from "@/lib/routes";
import { missingSteps } from "./setup/missing-steps";
import { useAgentSetup } from "./use-agent";

export function SetupBanner() {
  const t = useTranslations("aiAgent");
  const headingId = useId();
  const setup = useAgentSetup();
  if (setup.data === undefined) {
    return setup.isError ? (
      <LoadFailedAlert message={t("state.loadFailed")} error={setup.error} onRetry={() => void setup.refetch()} />
    ) : null;
  }
  const missing = missingSteps(setup.data.steps);
  if (setup.data.pausedBySupport || setup.data.ready || missing.length === 0) return null;
  return (
    <Card role="region" aria-labelledby={headingId} className={cardTints.attention}>
      <CardHeader>
        <CardTitle>
          <h2 id={headingId}>{t("banner.title", { count: missing.length })}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {missing.map((key) => (
            <li key={key}>{t(`setup.steps.${key}.todo`)}</li>
          ))}
        </ul>
        <Button asChild className="self-start md:self-auto">
          <Link href={routes.aiAgentSetup}>{t("banner.finish")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
