"use client";

// New package's second way in: choose one PDF brochure or several, and every trip in each becomes a group package. Each
// file shows where it stands, then the packages made, each linked, with what the AI still needs to sell it in red.
import { MAX_PDF_IMPORTS } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import errors from "@/i18n/messages/en-IN/errors.json";
import { packageRoute } from "@/lib/routes";
import type { PdfImport, usePdfImport } from "./use-pdf-import";

function ImportRow({ one }: { one: PdfImport }) {
  const t = useTranslations("packages.pdf");
  const tGaps = useTranslations("packages.sell.gaps");
  const tErrors = useTranslations("errors");
  // A trip's refusal comes back as its reason's code: its sentence, else the general one.
  const reasonText = (reason: string) =>
    Object.hasOwn(errors.reasons, reason)
      ? tErrors(`reasons.${reason as keyof typeof errors.reasons}`)
      : tErrors("generic");
  const busy = one.step !== "done" && one.step !== "failed";
  const result = one.result;
  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>{one.fileName}</ItemTitle>
        <ItemDescription className="flex items-center gap-2">
          {busy && <Spinner aria-hidden="true" />}
          {one.problem !== null ? t(`problems.${one.problem}`) : t(`steps.${one.step}`)}
        </ItemDescription>
        {one.step === "failed" && one.problem === null && <RefusalAlert error={one.error} />}
        {result !== null && (
          <div className="flex flex-col gap-2">
            <p>{t("made", { made: result.packages.length, trips: result.trips })}</p>
            {result.packages.map((made) => (
              <div key={made.id} className="flex flex-col gap-1">
                <TextLink href={packageRoute(made.id)}>{made.name}</TextLink>
                {made.gaps.length === 0 ? (
                  <StatusBadge tone="good">{t("complete")}</StatusBadge>
                ) : (
                  <p className="text-status-bad-ink">
                    {t("missing", { gaps: made.gaps.map((gap) => tGaps(gap)).join(", ") })}
                  </p>
                )}
              </div>
            ))}
            {result.skipped.map((skipped) => (
              <p key={skipped.name} className="text-status-bad-ink">
                {t("skipped", { name: skipped.name, reason: reasonText(skipped.reason) })}
              </p>
            ))}
          </div>
        )}
      </ItemContent>
    </Item>
  );
}

export function PdfImportSection({ importer }: { importer: ReturnType<typeof usePdfImport> }) {
  const t = useTranslations("packages.pdf");
  const picker = useRef<HTMLInputElement>(null);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="pdf-import-heading">
      <Separator />
      <h3 id="pdf-import-heading" className="font-semibold">
        {t("title")}
      </h3>
      <p className="text-muted-foreground">{t("description", { max: MAX_PDF_IMPORTS })}</p>
      <div>
        <Button
          type="button"
          variant="ai"
          disabled={importer.running}
          onClick={() => {
            picker.current?.click();
          }}
        >
          {importer.running && <Spinner aria-hidden="true" />}
          {importer.running ? t("working") : t("choose")}
        </Button>
      </div>
      <input
        ref={picker}
        type="file"
        accept="application/pdf"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="package-pdf-input"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length > 0) void importer.start(files);
        }}
      />
      {importer.imports.length > 0 && (
        <ItemGroup aria-live="polite">
          {importer.imports.map((one) => (
            <ImportRow key={one.key} one={one} />
          ))}
        </ItemGroup>
      )}
    </section>
  );
}
