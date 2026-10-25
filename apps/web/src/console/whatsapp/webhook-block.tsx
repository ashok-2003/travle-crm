"use client";

// The webhook block (spec 3.5): the address and header to paste once in MSG91's panel. The secrets come from the process
// settings through whatsapp.webhookSettings (super admins only), are kept off the page until Show secret is pressed, and
// are not stored in the browser.
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Details } from "@/components/details";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { Button } from "@/components/ui/button";
import { useConsoleTRPC } from "../data/console-trpc";

function Secret({ reveal }: { reveal: boolean }) {
  const t = useTranslations("consoleWhatsapp.webhook");
  const trpc = useConsoleTRPC();
  const settings = useQuery({ ...trpc.whatsapp.webhookSettings.queryOptions(), enabled: reveal, gcTime: 0 });
  if (!reveal) return null;
  if (settings.isError)
    return <LoadFailedAlert message={t("loadFailed")} error={settings.error} onRetry={() => void settings.refetch()} />;
  if (settings.data === undefined || settings.data === null) return null;
  const { url, headerName, headerValue } = settings.data;
  return (
    <Details
      rows={[
        {
          label: t("url"),
          value: <span className="numbers break-all">{url}</span>,
          action: <CopyButton value={url} label={t("copyUrl")} />,
        },
        {
          label: t("header"),
          value: <span className="numbers break-all">{`${headerName}: ${headerValue}`}</span>,
          action: <CopyButton value={headerValue} label={t("copyValue")} />,
        },
      ]}
    />
  );
}

export function WebhookBlock() {
  const t = useTranslations("consoleWhatsapp.webhook");
  const [reveal, setReveal] = useState(false);
  return (
    <section aria-labelledby="webhook-heading" className="flex flex-col gap-3">
      <h2 id="webhook-heading" className="text-section font-semibold">
        {t("title")}
      </h2>
      <p className="max-w-[65ch] text-muted-foreground">{t("intro")}</p>
      <Secret reveal={reveal} />
      <Button
        variant="outline"
        className="self-start"
        onClick={() => {
          setReveal((shown) => !shown);
        }}
      >
        {reveal ? t("hide") : t("show")}
      </Button>
    </section>
  );
}
