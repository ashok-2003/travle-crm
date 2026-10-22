"use client";

// Last 30 days (spec 3.2, item 7): how many enquiries the form took, as new leads and as repeats, and how many it
// stopped, each in mono with what it means. Stopped enquiries are never saved, so only their number is known. A count
// that didn't load says so with Try again while the rest of the page works.
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { InfoHint } from "@/components/info-hint";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/data/trpc";
import { formatCount } from "@/lib/format";

const counts = ["enquiries", "newLeads", "repeatEnquiries", "stopped"] as const;

export function CountsCard() {
  const t = useTranslations("websiteFormSettings.counts");
  const trpc = useTRPC();
  const query = useQuery(trpc.websiteForm.counts.queryOptions());
  return (
    <section aria-labelledby="website-form-counts" className="flex flex-col gap-3">
      <h2 id="website-form-counts" className="text-section font-semibold">
        {t("heading")}
      </h2>
      {query.isError && (
        <LoadFailedAlert
          message={t("loadFailed")}
          error={query.error}
          onRetry={() => {
            void query.refetch();
          }}
        />
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {counts.map((name) => (
          <Card key={name} size="sm">
            <CardHeader>
              <CardDescription className="flex items-center gap-1">
                {t(`${name}.label`)}
                <InfoHint term={t(`${name}.label`)}>{t(`${name}.info`)}</InfoHint>
              </CardDescription>
              <CardTitle className="numbers text-2xl">
                {query.data === undefined ? <Skeleton className="h-8 w-16" /> : formatCount(query.data[name])}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <p className="text-label text-muted-foreground">{t("note")}</p>
    </section>
  );
}
