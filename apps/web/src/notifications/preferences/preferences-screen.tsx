"use client";

// /account/notifications (spec 9.4): push on this device, and the person's own choice of what reaches them by email
// and push, for every kind and for each one; the bell always shows everything, so it isn't offered. A change saves at
// once. Support impersonating the person sees the choices but can't change them (consent is the person's own), and
// staff who sign in without email are told why none reaches them.
import { useTranslations } from "next-intl";
import { Fragment, useId } from "react";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";
import { PageTitle } from "@/components/page-title";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { shownEmail } from "@/lib/shown-email";
import { useMe } from "@/session/me-context";
import { PushOnThisDevice } from "../push/push-on-this-device";
import { EVERY_KIND, notificationKinds, reaches } from "./kinds";
import { PreferenceRow } from "./preference-row";
import { usePreferences, useSetPreference } from "./use-preferences";

export function NotificationPreferencesScreen() {
  const t = useTranslations("notifications.preferences");
  const tCommon = useTranslations("common");
  const headingId = useId();
  const me = useMe();
  const preferences = usePreferences();
  const change = useSetPreference();
  const impersonated = me.impersonatedBy !== null;
  const hasEmail = shownEmail(me.user.email) !== null;

  let content;
  if (!preferences.data) {
    content = preferences.isError ? (
      <ErrorState
        message={t("loadFailed")}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void preferences.refetch()}
      />
    ) : (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={t("loading")} className="flex flex-col gap-2">
          {[0, 1].map((row) => (
            <Skeleton key={row} className="h-16 w-full" />
          ))}
        </div>
      </Delayed>
    );
  } else {
    const choices = preferences.data;
    const rows = [
      { kind: EVERY_KIND, label: t("everything.label"), hint: t("everything.hint") },
      ...notificationKinds.map(({ kind, messageKey }) => ({
        kind,
        label: t(`kinds.${messageKey}.label`),
        hint: t(`kinds.${messageKey}.hint`),
      })),
    ];
    content = (
      <>
        {impersonated && (
          <p className="text-label text-muted-foreground">{t("impersonating", { name: me.user.name })}</p>
        )}
        {!hasEmail && <p className="text-label text-muted-foreground">{t("noEmail")}</p>}
        <Card>
          <CardContent className="flex flex-col gap-3">
            {rows.map(({ kind, label, hint }, index) => (
              <Fragment key={kind}>
                {index > 0 && <Separator />}
                <PreferenceRow
                  label={label}
                  hint={hint}
                  receives={{
                    email: hasEmail && reaches(choices, "email", kind),
                    push: reaches(choices, "push", kind),
                  }}
                  disabled={{ email: impersonated || !hasEmail, push: impersonated }}
                  onChange={(channel, receives) => {
                    change.mutate({ channel, kind, optedOut: !receives });
                  }}
                />
              </Fragment>
            ))}
          </CardContent>
        </Card>
        <p className="text-label text-muted-foreground">{t("kindWins")}</p>
      </>
    );
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageTitle>{t("title")}</PageTitle>
      <p className="text-muted-foreground">{t("intro")}</p>
      <PushOnThisDevice />
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        <h2 id={headingId} className="text-section font-semibold">
          {t("kindsHeading")}
        </h2>
        {content}
      </section>
    </div>
  );
}
