"use client";

// /account/notifications (spec 9.4): push on this device, and the person's own choice of what reaches them by email
// and push, for every kind and for each one; the bell always shows everything, so it isn't offered. A change saves at
// once. Support impersonating the person sees the choices but can't change them (consent is the person's own), and
// staff who sign in without email are told why none reaches them.
import { useTranslations } from "next-intl";
import { Fragment, useId } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/text-link";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { routes } from "@/lib/routes";
import { shownEmail } from "@/lib/shown-email";
import { useMe } from "@/session/me-context";
import { PushOnThisDevice } from "../push/push-on-this-device";
import { EVERY_KIND, notificationKinds, reaches } from "./kinds";
import { PreferenceRow } from "./preference-row";
import { usePreferences, useSetPreference } from "./use-preferences";

export function NotificationPreferencesScreen() {
  const t = useTranslations("notifications.preferences");
  const tCommon = useTranslations("common");
  const tShell = useTranslations("shell");
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
        error={preferences.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void preferences.refetch()}
      />
    ) : (
      <LoadingRows rows={2} shape="twoLines" label={t("loading")} />
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
      <BackLink href={routes.account} label={tShell("navigation.account")} />
      <PageHeader title={t("title")} intro={t("intro")} />
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
