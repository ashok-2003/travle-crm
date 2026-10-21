"use client";

// The export dialog (spec 3.3, 3.5, B39, B41, B42), a bottom sheet on phones: what the file will hold, Excel (chosen)
// or CSV as choice cards, what the file holds and how long it's kept, and Prepare the file, held while it is asked
// for. The worker then makes it: "Preparing 312 leads…" with its progress, and the dialog may close meanwhile (the bell
// says when it's ready, and it shows here again on opening). Then the file's name and size, with Download. A failed or
// deleted export says why above the choice, to prepare it again. Preparing and downloading are exports (ADR 0021): a
// read-only agency may, a cancelled one may not.
//
// For a feature (W2): the export it asked for lives in this component's state, so the progress shows again on
// reopening only while it stays mounted: keep the Export button, which renders this dialog, mounted while the dialog is
// closed. Closing it once the file is ready or the export failed starts afresh next time (R44).
import type { ExportFormat } from "@travel-crm/contracts/exports";
import { exportFormats } from "@travel-crm/contracts/exports";
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { Details, type Detail } from "@/components/details";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatFileSize } from "@/files/file-size";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { useExportFailure, type RowsWord } from "./export-failure";
import { ExportProgress } from "./export-progress";
import { useExport, type ExportCalls } from "./use-export";

export function ExportDialog({
  open,
  onOpenChange,
  title,
  intro,
  holds,
  rowsWord,
  calls,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  intro: string;
  /** What the file will hold, as the list shows it ("Everyone · Open · Goa"). */
  holds: ReactNode;
  rowsWord: RowsWord;
  calls: ExportCalls;
}) {
  const t = useTranslations("exports");
  const tCommon = useTranslations("common");
  const id = useId();
  const write = useWriteAccess("export");
  const failure = useExportFailure();
  const { exportId, detail, start, download, reset } = useExport(calls);
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const shown = detail.data;
  const status = exportId === null ? null : shown?.status;
  const choosing = status === null || status === "failed" || status === "expired";
  const file = status === "ready" ? (shown?.file ?? null) : null;
  const problem = choosing ? failure(shown) : null;
  const hint = write.hint ? `${id}-hint` : undefined;
  // What it holds, then the file once it's ready: one list, so its rows are spaced alike (W11).
  const details: Detail[] = [{ label: t("dialog.holds"), value: holds }];
  if (file) {
    details.push(
      { label: t("page.file"), value: file.fileName },
      { label: t("page.size"), value: formatFileSize(file.sizeBytes) },
    );
  }
  // Closed while the file is made, it shows its progress again on opening; closed after, it starts afresh.
  const changeOpen = (next: boolean) => {
    if (!next && status !== "making") reset();
    onOpenChange(next);
  };

  const footer = choosing ? (
    <Button
      disabled={!write.allowed || start.isPending}
      aria-describedby={hint}
      onClick={() => {
        if (status !== null) reset();
        start.mutate(format);
      }}
    >
      {t("dialog.prepare")}
    </Button>
  ) : (
    <>
      <Button
        variant="outline"
        onClick={() => {
          changeOpen(false);
        }}
      >
        {tCommon("close")}
      </Button>
      {file && (
        <Button
          disabled={!write.allowed || download.isPending}
          aria-describedby={hint}
          onClick={() => {
            if (exportId !== null) download.mutate(exportId);
          }}
        >
          {t("dialog.download")}
        </Button>
      )}
    </>
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={changeOpen}
      busy={start.isPending}
      title={title}
      description={intro}
      cancel={choosing}
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        {problem !== null && (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
        )}
        <Details rows={details} />
        {choosing && (
          <>
            <FieldSet disabled={start.isPending}>
              <FieldLegend variant="label">{t("dialog.format")}</FieldLegend>
              <RadioGroup
                value={format}
                onValueChange={(value) => {
                  setFormat(value === "csv" ? "csv" : "xlsx");
                }}
              >
                {exportFormats.map((choice) => (
                  // The whole card picks the format; the radio is named by its title and described by its hint.
                  <FieldLabel key={choice} htmlFor={`${id}-${choice}`}>
                    <Field orientation="horizontal">
                      <RadioGroupItem
                        value={choice}
                        id={`${id}-${choice}`}
                        aria-labelledby={`${id}-${choice}-title`}
                        aria-describedby={`${id}-${choice}-hint`}
                      />
                      <FieldContent>
                        <FieldTitle id={`${id}-${choice}-title`}>{t(`formats.${choice}`)}</FieldTitle>
                        <FieldDescription id={`${id}-${choice}-hint`}>{t(`formats.${choice}Hint`)}</FieldDescription>
                      </FieldContent>
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
            </FieldSet>
            <p className="text-muted-foreground">{t("dialog.privacy")}</p>
            <RefusalAlert error={start.error} />
          </>
        )}
        {!choosing && file === null && (
          <div className="flex flex-col gap-2">
            <ExportProgress detail={shown} rowsWord={rowsWord} />
            <p className="text-label text-muted-foreground">{t("dialog.closeHint")}</p>
            <RefusalAlert error={detail.error} />
          </div>
        )}
        <WriteHint id={`${id}-hint`} hint={write.hint} />
      </div>
    </ResponsiveDialog>
  );
}
