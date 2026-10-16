"use client";

// The colour and terms section (organization.branding): the saved branding in its form, or, before the business
// details exist, the way to them first (the api refuses branding until then).
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/data/trpc";
import { routes } from "@/lib/routes";
import { BrandingDetailsForm } from "./branding-details-form";

export function BrandingForm() {
  const t = useTranslations("documents.branding");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  // Always asked again when the screen opens: a form starts from the api's latest answer, not a restored copy.
  const branding = useQuery(trpc.organization.branding.get.queryOptions());

  const body = () => {
    if (branding.data) return <BrandingDetailsForm saved={branding.data} />;
    if (branding.data === null) {
      return (
        <div className="flex flex-col items-start gap-2">
          <p>{t("profileFirst")}</p>
          <Link href={routes.profile} className="flex min-h-11 items-center text-primary underline underline-offset-4">
            {t("profileLink")}
          </Link>
        </div>
      );
    }
    if (branding.isError) {
      return (
        <ErrorState
          message={t("details.loadFailed")}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void branding.refetch()}
        />
      );
    }
    return (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={tCommon("loading")} className="flex flex-col gap-4">
          <Skeleton className="h-11 w-48" />
          <Skeleton className="h-28 w-full" />
        </div>
      </Delayed>
    );
  };

  return (
    <section aria-labelledby="branding-details-heading" className="flex flex-col gap-3">
      <h2 id="branding-details-heading" className="text-section font-semibold">
        {t("details.heading")}
      </h2>
      <Card>
        <CardContent>{body()}</CardContent>
      </Card>
    </section>
  );
}
