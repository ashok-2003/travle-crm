"use client";

// Adding a file to a record: whether it is sensitive, then the file picker. The file is checked before anything is
// sent; while it goes to storage its progress shows, with a way to stop; a problem, a refusal (the storage limit's
// among them) or a storage that can't be reached says so. While the organization can't make changes (ADR 0021) the
// control is off and says why.
import { UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { useErrorMessage } from "@/lib/error-message";
import { useWriteAccess } from "@/subscription/write-access";
import { ACCEPTED_FILES, checkAttachmentFile } from "./attachment-file";
import { UploadError } from "./upload";
import type { AttachmentRecord } from "./use-attachments";
import { useUploadAttachment, wasStopped } from "./use-upload-attachment";

export function UploadControl({ record }: { record: AttachmentRecord }) {
  const t = useTranslations("business.attachments");
  const { apiError } = useErrorMessage();
  const write = useWriteAccess();
  const { upload, progress, stop } = useUploadAttachment(record);
  const picker = useRef<HTMLInputElement>(null);
  const id = useId();
  const [sensitive, setSensitive] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const choose = (file: File) => {
    const check = checkAttachmentFile(file);
    if (!check.ok) {
      upload.reset();
      setProblem(t(`problems.${check.problem}`, { name: file.name }));
      return;
    }
    setProblem(null);
    upload.mutate(
      { file, contentType: check.contentType, sensitive },
      {
        onSuccess: () => {
          setSensitive(false);
        },
      },
    );
  };
  const failure = (error: unknown): string => {
    if (error instanceof UploadError) return error.status === 0 ? t("storageUnreachable") : t("storageRefused");
    return apiError(error);
  };
  const percent = Math.round(progress * 100);
  const busy = upload.isPending;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <Field orientation="horizontal" data-disabled={!write.allowed || busy}>
          <Checkbox
            id={`${id}-sensitive`}
            checked={sensitive}
            disabled={!write.allowed || busy}
            onCheckedChange={(checked) => {
              setSensitive(checked === true);
            }}
          />
          <FieldContent>
            <FieldLabel htmlFor={`${id}-sensitive`}>{t("sensitive")}</FieldLabel>
            <FieldDescription>{t("sensitiveHint")}</FieldDescription>
          </FieldContent>
        </Field>
        <input
          ref={picker}
          type="file"
          accept={ACCEPTED_FILES}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared, so choosing the same file again (after a refusal) is a change too.
            event.target.value = "";
            if (file) choose(file);
          }}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            type="button"
            disabled={!write.allowed || busy}
            aria-describedby={write.hint ? `${id}-hint` : undefined}
            onClick={() => picker.current?.click()}
          >
            <UploadIcon aria-hidden="true" />
            {t("upload")}
          </Button>
          <p className="text-label text-muted-foreground">{t("allowed")}</p>
        </div>
        {write.hint && (
          <p id={`${id}-hint`} className="text-label text-muted-foreground">
            {write.hint}
          </p>
        )}
        {busy && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 break-words script-leading">
                {t("uploading", { name: upload.variables.file.name })}
              </p>
              <span className="numbers">{t("progress", { percent })}</span>
            </div>
            <Progress value={percent} aria-label={t("uploading", { name: upload.variables.file.name })} />
            <Button type="button" variant="ghost" className="self-start" onClick={stop}>
              {t("stop")}
            </Button>
          </div>
        )}
        {problem && (
          <Alert variant="destructive">
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
        )}
        {upload.isError && !wasStopped(upload.error) && (
          <Alert variant="destructive">
            <AlertDescription>{failure(upload.error)}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
