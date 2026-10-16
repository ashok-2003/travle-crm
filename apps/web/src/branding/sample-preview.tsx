"use client";

// "Preview on a sample quotation" (spec 9.3): issues a sample with the branding as it is saved, waits while the worker
// prepares its PDF, then offers it to download; if asking after it fails, it says so and asks again when told. Once a
// sample exists, the same button makes a new one, for after a change to the branding. The sample is kept with the
// organization's documents, as every issued document is; its number, SMPL-…, says what it is.
import { useTranslations } from "next-intl";
import { useId } from "react";
import { ErrorState } from "@/components/error-state";
import { RefusalAlert } from "@/components/refusal-alert";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { documentState } from "@/documents/document-state";
import { useDownloadPdf } from "@/documents/use-download-pdf";
import { routes } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { useSample } from "./use-sample";

export function SamplePreview() {
  const t = useTranslations("documents.sample");
  const tCommon = useTranslations("common");
  const write = useWriteAccess();
  const take = useWriteAccess("export");
  const hintId = useId();
  const { issue, sample, checkFailed, checkError, checkAgain } = useSample();
  const download = useDownloadPdf();
  const state = sample ? documentState(sample) : null;

  return (
    <section aria-labelledby="sample-heading" className="flex flex-col items-start gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="sample-heading" className="text-section font-semibold">
          {t("heading")}
        </h2>
        <p className="max-w-[65ch] text-label text-muted-foreground">{t("intro")}</p>
      </div>
      {sample && checkFailed && (
        <ErrorState
          message={t("checkFailed", { number: sample.number })}
          error={checkError}
          retryLabel={tCommon("tryAgain")}
          onRetry={checkAgain}
        />
      )}
      {sample && !checkFailed && (
        // Polite: the preparing and ready lines follow each other as the worker gets on.
        <div role="status" className="flex flex-wrap items-center gap-3">
          {state === "preparing" && <Spinner aria-hidden="true" />}
          <p>{t(state ?? "preparing", { number: sample.number })}</p>
        </div>
      )}
      <RefusalAlert error={issue.error} />
      <div className="flex flex-wrap items-center gap-3">
        {sample && state === "ready" && (
          // An export: a suspended organization's Owner may still take the PDF (ADR 0021).
          <Button
            disabled={!take.allowed || download.isPending}
            onClick={() => {
              download.mutate(sample.id);
            }}
          >
            {t("download")}
          </Button>
        )}
        <Button
          variant="outline"
          disabled={!write.allowed || issue.isPending || state === "preparing"}
          aria-describedby={write.hint === null ? undefined : hintId}
          onClick={() => {
            issue.mutate();
          }}
        >
          {issue.isPending ? t("issuing") : sample ? t("issueAgain") : t("issue")}
        </Button>
        {sample && <TextLink href={routes.documents}>{t("allDocuments")}</TextLink>}
      </div>
      <WriteHint id={hintId} hint={write.hint} />
    </section>
  );
}
