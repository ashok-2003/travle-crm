"use client";

// Home's setup card (spec 7.1): for whoever may change the organization's settings, the first thing on Home, above the
// usual Home, until every step of the setup checklist is done. It says how far along the organization is, lists the
// steps still to do, each leading to where it is done, and leads to the whole checklist. It has no dismiss: it goes
// once everything is done. While the checklist loads, or if it didn't, that shows in its place.
import { useTranslations } from "next-intl";
import { useId } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { TextLink } from "@/components/text-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { SetupProgress, SetupSteps } from "./setup-steps";
import { useSetupChecklist } from "./use-setup-checklist";

export function SetupCard() {
  const t = useTranslations("business.setup");
  const tCommon = useTranslations("common");
  const me = useMe();
  const checklist = useSetupChecklist();
  const headingId = useId();

  if (checklist.data?.done) return null;
  if (checklist.data) {
    return (
      <Card role="region" aria-labelledby={headingId}>
        <CardHeader>
          <CardTitle>
            <h2 id={headingId}>{t("homeHeading", { organization: me.organization.name })}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SetupProgress checklist={checklist.data} />
          <SetupSteps checklist={checklist.data} toDoOnly />
          <TextLink href={routes.setup}>{t("everyStep")}</TextLink>
        </CardContent>
      </Card>
    );
  }
  if (checklist.isError) {
    return (
      <ErrorState
        message={t("loadFailed")}
        error={checklist.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void checklist.refetch()}
      />
    );
  }
  return <LoadingRows rows={2} shape="twoLines" />;
}
