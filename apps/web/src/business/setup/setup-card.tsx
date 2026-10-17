"use client";

// Home's setup card (spec 7.1): for whoever may change the organization's settings, the first thing on Home, above the
// usual Home, until every step of the setup checklist is done. It says how far along the organization is, lists the
// next two steps still to do (the owner's choice: short enough that what follows it, Today's nudge, is on a phone's
// first screen), each leading to where it is done, and leads to the whole checklist, which lists every step. It has
// no dismiss: it goes once everything is done. While the checklist loads, or if it didn't, that shows in its place.
import { useTranslations } from "next-intl";
import { Fragment, useId } from "react";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";
import { TextLink } from "@/components/text-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { SetupProgress, SetupSteps } from "./setup-steps";
import { useSetupChecklist } from "./use-setup-checklist";

/** How many of the steps still to do the card lists; the setup screen lists them all. */
const STEPS_SHOWN = 2;

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
          <SetupSteps checklist={checklist.data} nextToDo={STEPS_SHOWN} />
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
  return <LoadingCard />;
}

/** A line of text not yet loaded: a skeleton as tall as the text it stands for. */
function TextSkeleton({ className }: { className: string }) {
  return <Skeleton className={className}>&nbsp;</Skeleton>;
}

/**
 * The card's shape while the checklist loads (after 200ms, as every skeleton: components/delayed.tsx), built from the
 * card's own parts so it is as tall as a card with two steps to do, and Home doesn't move when that arrives.
 */
function LoadingCard() {
  const t = useTranslations("common");
  return (
    <Delayed>
      <Card role="status" aria-busy="true" aria-label={t("loading")}>
        <CardHeader>
          <CardTitle>
            <TextSkeleton className="w-64 max-w-full" />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <TextSkeleton className="w-20 text-label" />
            <Skeleton className="h-1 w-full" />
          </div>
          <ItemGroup role="presentation">
            {[0, 1].map((row) => (
              <Fragment key={row}>
                {row > 0 && <ItemSeparator />}
                <Item size="sm">
                  <ItemContent>
                    <ItemTitle>
                      <TextSkeleton className="w-24" />
                    </ItemTitle>
                    {/* As tall as ItemDescription's line, which is a <p> and can't hold a skeleton's <div>. */}
                    <TextSkeleton className="w-56 max-w-full text-sm leading-normal" />
                  </ItemContent>
                </Item>
              </Fragment>
            ))}
          </ItemGroup>
          <div className="flex min-h-11 items-center">
            <TextSkeleton className="w-28" />
          </div>
        </CardContent>
      </Card>
    </Delayed>
  );
}
