"use client";

// Home's setup line (spec 7.1): for whoever may change the organization's settings, one slim line under the greeting
// until every step of the checklist is done: how far along, the next step still to do, and the way to the setup
// screen, which lists every step. It has no dismiss: it goes once everything is done. While the checklist loads, or if
// it didn't, that shows in a line of its own.
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";
import { ForwardLink } from "@/components/text-link";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { useSetupChecklist } from "./use-setup-checklist";

export function SetupCard() {
  const t = useTranslations("business.setup");
  const tCommon = useTranslations("common");
  const me = useMe();
  const checklist = useSetupChecklist();
  const headingId = useId();

  if (checklist.data?.done) return null;
  if (checklist.data) {
    const next = checklist.data.steps.find((step) => !step.done);
    const done = checklist.data.steps.filter((step) => step.done).length;
    return (
      <Card role="region" aria-labelledby={headingId}>
        <CardContent className="flex flex-wrap items-center justify-between gap-x-4">
          {/* The region's name, for screen readers; the line says the rest. */}
          <h2 id={headingId} className="sr-only">
            {t("homeHeading", { organization: me.organization.name })}
          </h2>
          <p className="text-muted-foreground">
            {t("slim", {
              done,
              total: checklist.data.steps.length,
              step: next === undefined ? "" : t(`steps.${next.step}.title`),
            })}
          </p>
          <ForwardLink href={routes.setup} label={t("finishSetup")} />
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
  return <LoadingLine />;
}

/** The line's shape while the checklist loads (after 200ms, as every skeleton: components/delayed.tsx). */
function LoadingLine() {
  const t = useTranslations("common");
  return (
    <Delayed>
      <Card role="status" aria-busy="true" aria-label={t("loading")}>
        <CardContent className="flex min-h-11 items-center">
          <Skeleton className="w-64 max-w-full">&nbsp;</Skeleton>
        </CardContent>
      </Card>
    </Delayed>
  );
}
