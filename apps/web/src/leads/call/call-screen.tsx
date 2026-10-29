"use client";

// /call/<lead>: the page "Send to my phone" opens on the person's phone (release 5, scope 3.4). It shows the name and
// number and one big Call now button; where the browser allows (Android) it dials by itself as it opens, and on an
// iPhone the one tap is the button. Dialling is remembered, so "How did the call go?" follows the person back.
import { useQuery } from "@tanstack/react-query";
import { PhoneIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/data/trpc";
import { formatPhoneNumber } from "@/lib/format";
import { leadRoute } from "@/lib/routes";
import { rememberDial } from "./pending-call";

export function CallScreen({ leadId }: { leadId: string }) {
  const t = useTranslations("leads.call.page");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const target = useQuery(trpc.calls.target.queryOptions({ leadId }));
  const { name, phone } = target.data ?? { name: "", phone: null };
  useEffect(() => {
    // Android lets a page open the dialler by itself; other phones wait for the tap.
    if (phone === null || !/android/i.test(navigator.userAgent)) return;
    rememberDial({ leadId, name });
    window.location.href = `tel:${phone}`;
  }, [leadId, name, phone]);

  if (target.data === undefined) {
    return target.isError ? (
      <ErrorState
        message={t("loadFailed")}
        error={target.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void target.refetch()}
      />
    ) : (
      <LoadingRows rows={2} shape="twoLines" />
    );
  }
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageHeader title={<span className="script-leading">{name}</span>} intro={t("intro")} />
      {phone === null ? (
        <p className="text-muted-foreground">{t("noPhone")}</p>
      ) : (
        <div className="flex flex-col items-start gap-4">
          <p className="numbers text-number-lg">{formatPhoneNumber(phone)}</p>
          <Button asChild size="lg">
            <a
              href={`tel:${phone}`}
              onClick={() => {
                rememberDial({ leadId, name });
              }}
            >
              <PhoneIcon aria-hidden="true" />
              {t("callNow", { name })}
            </a>
          </Button>
        </div>
      )}
      <TextLink href={leadRoute(leadId)}>{t("openLead")}</TextLink>
    </div>
  );
}
