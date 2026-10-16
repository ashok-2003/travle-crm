"use client";

// "Preview on a sample quotation" (spec 9.3): issues a sample with the branding as it is saved, waits while the worker
// prepares its PDF, then offers it to download. The sample is kept with the organization's documents, as every
// issued document is; its number, SMPL-…, says what it is.
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { documentState } from "@/documents/document-state";
import { useDownloadPdf } from "@/documents/use-download-pdf";
import { useErrorMessage } from "@/lib/error-message";
import { routes } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { useSample } from "./use-sample";

export function SamplePreview() {
  const t = useTranslations("documents.sample");
  const { apiError } = useErrorMessage();
  const write = useWriteAccess();
  const { issue, sample } = useSample();
  const download = useDownloadPdf();
  const state = sample ? documentState(sample) : null;

  return (
    <section aria-labelledby="sample-heading" className="flex flex-col gap-3">
      <h2 id="sample-heading" className="text-section font-semibold">
        {t("heading")}
      </h2>
      <Card>
        <CardContent className="flex flex-col items-start gap-4">
          <p className="max-w-[65ch] text-muted-foreground">{t("intro")}</p>
          {sample && (
            // Polite: the preparing and ready lines follow each other as the worker gets on.
            <div role="status" className="flex flex-wrap items-center gap-3">
              {state === "preparing" && <Spinner aria-hidden="true" />}
              <p>{t(state ?? "preparing", { number: sample.number })}</p>
            </div>
          )}
          {issue.isError && (
            <Alert variant="destructive">
              <AlertDescription>{apiError(issue.error)}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {sample && state === "ready" && (
              <Button
                disabled={download.isPending}
                onClick={() => {
                  download.mutate(sample.id);
                }}
              >
                {t("download")}
              </Button>
            )}
            {/* Again after a change to the branding: each preview is a new sample. */}
            <Button
              variant="outline"
              disabled={!write.allowed || issue.isPending || state === "preparing"}
              onClick={() => {
                issue.mutate();
              }}
            >
              {issue.isPending ? t("issuing") : t("issue")}
            </Button>
            {sample && (
              <Link
                href={routes.documents}
                className="flex min-h-11 items-center text-primary underline underline-offset-4"
              >
                {t("allDocuments")}
              </Link>
            )}
          </div>
          {write.hint !== null && <p className="text-label text-muted-foreground">{write.hint}</p>}
        </CardContent>
      </Card>
    </section>
  );
}
