"use client";

// Choosing an import's file (spec 3.2 step 1, B1, B2, B7): the file button, what a file may be, a sample to start from,
// and the file's way straight to storage, as the files panel's upload (UploadControl): checked first, then its
// progress with Stop, which cancels the import (X3), a refusal's own sentence (the agency's storage full among them),
// and Try again without choosing the file again. The import's own calls record it, confirm it and cancel it; the
// screen then follows the import's address. While the agency can't make changes (ADR 0021) the button is off and says
// why.
import type { SpreadsheetContentType } from "@travel-crm/contracts/files";
import type { StartedImport } from "@travel-crm/contracts/imports";
import { CircleAlertIcon, UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { TextLink } from "@/components/text-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { UploadError } from "@/files/upload";
import { useSignedUpload, wasStopped } from "@/files/use-signed-upload";
import { useErrorMessage } from "@/lib/error-message";
import { formatCount } from "@/lib/format";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { ACCEPTED_IMPORT_FILES, checkImportFile } from "./import-file";
import { uploadedImports } from "./uploaded-imports";

interface FileRequest {
  file: File;
  contentType: SpreadsheetContentType;
}

export function ImportFileStep({
  maxRows,
  sampleHref,
  start,
  confirm,
  cancel,
  onUploaded,
}: {
  /** The kind's row limit (B2): 10,000 for leads, 500 for staff. */
  maxRows: number;
  sampleHref: string;
  /** Records the import and signs its file's upload (the kind's start procedure). */
  start: (file: { fileName: string; contentType: SpreadsheetContentType; sizeBytes: number }) => Promise<StartedImport>;
  /** Tells the api the file has arrived (the kind's confirmUpload procedure). */
  confirm: (importId: string) => Promise<unknown>;
  /** Ends an import whose upload the person stopped (the kind's cancel procedure), so it doesn't wait as Uploading. */
  cancel: (importId: string) => Promise<unknown>;
  /** The import, its file in storage: the screen goes to its address. */
  onUploaded: (importId: string) => void;
}) {
  const t = useTranslations("imports.file");
  const tProblems = useTranslations("imports.problems");
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  const write = useWriteAccess("change");
  const picker = useRef<HTMLInputElement>(null);
  const id = useId();
  const [problem, setProblem] = useState<string | null>(null);
  /** Each signed upload's import, for confirming it: the upload knows only its attachment. */
  const imports = useRef(uploadedImports());
  const { upload, progress, stop } = useSignedUpload<FileRequest, string>({
    requestUpload: async ({ file, contentType }) => {
      const started = await start({ fileName: file.name, contentType, sizeBytes: file.size });
      imports.current.remember(started.attachmentId, started.importId);
      return { attachmentId: started.attachmentId, upload: started.upload };
    },
    confirmUpload: async (attachmentId) => {
      const importId = imports.current.importFor(attachmentId);
      await confirm(importId);
      return importId;
    },
    onSuccess: (importId) => {
      onUploaded(importId);
    },
    onStopped: (attachmentId) => {
      // Nothing to tell the person if it fails: they stopped it, and the import expires in a week regardless.
      cancel(imports.current.importFor(attachmentId)).catch(() => undefined);
    },
  });
  const off = !write.allowed || upload.isPending;

  const choose = (file: File) => {
    const check = checkImportFile(file);
    if (!check.ok) {
      upload.reset();
      setProblem(tProblems(check.problem, { name: file.name }));
      return;
    }
    setProblem(null);
    upload.mutate({ file, contentType: check.contentType });
  };
  const failure = (error: unknown): string => {
    if (error instanceof UploadError) return error.status === 0 ? t("storageUnreachable") : t("storageRefused");
    return apiError(error);
  };
  const percent = Math.round(progress * 100);

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={picker}
        type="file"
        accept={ACCEPTED_IMPORT_FILES}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared, so choosing the same file again (after a refusal) is a change too.
          event.target.value = "";
          if (file) choose(file);
        }}
      />
      <div className="flex flex-col items-start gap-2">
        <Button
          type="button"
          disabled={off}
          aria-describedby={write.hint ? `${id}-hint` : undefined}
          onClick={() => picker.current?.click()}
        >
          <UploadIcon aria-hidden="true" />
          {t("choose")}
        </Button>
        <WriteHint id={`${id}-hint`} hint={write.hint} />
        <p className="text-label text-muted-foreground">{t("allowed", { rows: formatCount(maxRows) })}</p>
        <TextLink href={sampleHref}>{t("sample")}</TextLink>
      </div>
      {upload.isPending && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 break-words script-leading">{t("uploading", { name: upload.variables.file.name })}</p>
            <span className="numbers">{t("progress", { percent })}</span>
          </div>
          <Progress value={percent} aria-label={t("uploading", { name: upload.variables.file.name })} />
          <Button type="button" variant="ghost" className="self-start" onClick={stop}>
            {t("stop")}
          </Button>
        </div>
      )}
      {problem !== null && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
      {upload.isError && !wasStopped(upload.error) && (
        <div className="flex flex-col items-start gap-2">
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription>{failure(upload.error)}</AlertDescription>
          </Alert>
          <Button
            type="button"
            variant="outline"
            aria-label={t("tryAgainName", { name: upload.variables.file.name })}
            disabled={!write.allowed}
            onClick={() => {
              // The same request: picked up where it stopped, with the same signed upload while it lasts.
              upload.mutate(upload.variables);
            }}
          >
            {tCommon("tryAgain")}
          </Button>
        </div>
      )}
    </div>
  );
}
