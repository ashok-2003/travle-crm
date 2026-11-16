"use client";

// Push on this device (spec 9.4): whether this browser gets push notifications, turning them on or off, and where it
// can't, why, in plain words: no push in this browser, no service worker yet, or notifications blocked. The agency's
// notification choices show it for the member (the api refuses support impersonating them, since the pushes would
// reach support's device: `impersonatedName`), the console's updates page for a super admin's platform alerts.
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Delayed } from "@/components/delayed";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { PushApi } from "./push-api";
import { usePushOnThisDevice } from "./use-push-on-this-device";

const cannot = { unsupported: "unsupported", "no-worker": "noWorker", blocked: "blocked" } as const;

export function PushDeviceCard({
  api,
  impersonatedName = null,
  platform = false,
}: {
  api: PushApi;
  /** Support is signed in as this person, so can't turn push on. */
  impersonatedName?: string | null;
  /** The console's platform alerts, in their own words. */
  platform?: boolean;
}) {
  const t = useTranslations("notifications.push");
  const headingId = useId();
  const push = usePushOnThisDevice(api);
  const impersonated = impersonatedName !== null;
  const { state, busy } = push;

  let content;
  if (state === "checking") {
    content = (
      <Delayed>
        <Skeleton role="status" aria-label={t("checking")} className="h-11 w-full" />
      </Delayed>
    );
  } else if (state === "on" || state === "off") {
    const on = state === "on";
    let hint = on ? t(platform ? "platformOnHint" : "onHint") : t(platform ? "platformOffHint" : "offHint");
    if (impersonated) hint = t("impersonating", { name: impersonatedName });
    content = (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium">{t(platform ? "platformLabel" : "label")}</span>
            <StatusBadge tone={on ? "good" : "neutral"}>{on ? t("on") : t("off")}</StatusBadge>
          </div>
          <p className="text-label text-muted-foreground">{hint}</p>
        </div>
        <Button
          variant={on ? "outline" : "default"}
          className="shrink-0"
          disabled={busy || impersonated}
          onClick={() => void (on ? push.turnOff() : push.turnOn())}
        >
          {busy && <Spinner />}
          {busy ? t(on ? "turningOff" : "turningOn") : t(on ? "turnOff" : "turnOn")}
        </Button>
      </div>
    );
  } else {
    content = <p className="text-muted-foreground">{t(cannot[state])}</p>;
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-section font-semibold">
        {t(platform ? "platformHeading" : "heading")}
      </h2>
      <Card>
        <CardContent>{content}</CardContent>
      </Card>
    </section>
  );
}
