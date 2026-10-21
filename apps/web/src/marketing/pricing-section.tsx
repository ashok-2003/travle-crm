"use client";

// The public page's prices: the plans on sale, which the browser asks the api for (waiting out a sleeping one, as the
// gates do). While they load, a skeleton; when they can't be had or none is on sale, a plain sentence and the way to
// ask sales instead, never an empty grid. Never kept on the device.
import { brand } from "@travel-crm/brand";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { wakingRetry } from "@/data/server-waking";
import { whatsAppLink } from "./contact-links";
import { fetchPlansOnSale } from "./plans-on-sale";
import { PricingPlans } from "./pricing-plans";
import { MarketingSection } from "./section";

export function PricingSection() {
  const t = useTranslations("marketing.pricing");
  const plans = useQuery({
    queryKey: ["marketing", "plans-on-sale"],
    queryFn: () => fetchPlansOnSale(),
    staleTime: 5 * 60 * 1000,
    meta: { persist: false },
    ...wakingRetry,
  });
  return (
    <MarketingSection id="pricing" title={t("title")} intro={t("intro")}>
      {plans.isPending ? (
        <Delayed>
          <div role="status" aria-label={t("loading")} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        </Delayed>
      ) : plans.data && plans.data.length > 0 ? (
        <PricingPlans plans={plans.data} />
      ) : (
        <div className="flex max-w-[65ch] flex-col items-start gap-4">
          <p>{t("unavailable")}</p>
          <Button asChild>
            <a href={whatsAppLink(brand.salesContact.phone)} target="_blank" rel="noopener noreferrer">
              {t("choose")}
            </a>
          </Button>
        </div>
      )}
    </MarketingSection>
  );
}
