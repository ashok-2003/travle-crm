"use client";

// Adding a file to a record: first whether it is sensitive, said to be for good, then the file picker. The file is
// checked before anything is sent; while it goes to storage its progress shows, with a way to stop; a problem, a
// refusal (the storage limit's among them) or a storage that can't be reached says so, and a failed upload can be tried
// again without choosing the file again. While the organization can't make changes (ADR 0021) the control is off and
// says why.
import { UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useErrorMessage } from "@/lib/error-message";
import { useWriteAccess } from "@/subscription/write-access";
import { ACCEPTED_FILES, checkAttachmentFile } from "./attachment-file";
import { UploadError } from "./upload";
import type { AttachmentRecord } from "./use-attachments";
import { useUploadAttachment, wasStopped, type UploadRequest } from "./use-upload-attachment";

/** Message keys in "business.attachments", each with its "…Hint". */
const SENSITIVITIES = ["sensitive", "notSensitive"] as const;
type Sensitivity = (typeof SENSITIVITIES)[number];

export function UploadControl({ record }: { record: AttachmentRecord }) {
  const t = useTranslations("business.attachments");
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  const write = useWriteAccess();
  const { upload, progress, stop } = useUploadAttachment(record);
  const picker = useRef<HTMLInputElement>(null);
  const id = useId();
  // Sensitive unless chosen otherwise: most business papers are, and a file can't be made sensitive afterwards.
  const [sensitivity, setSensitivity] = useState<Sensitivity>("sensitive");
  const [problem, setProblem] = useState<string | null>(null);
  const off = !write.allowed || upload.isPending;

  const send = (request: UploadRequest) => {
    setProblem(null);
    upload.mutate(request, {
      onSuccess: () => {
        setSensitivity("sensitive");
      },
    });
  };
  const choose = (file: File) => {
    const check = checkAttachmentFile(file);
    if (!check.ok) {
      upload.reset();
      setProblem(t(`problems.${check.problem}`, { name: file.name }));
      return;
    }
    send({ file, contentType: check.contentType, sensitive: sensitivity === "sensitive" });
  };
  const failure = (error: unknown): string => {
    if (error instanceof UploadError) return error.status === 0 ? t("storageUnreachable") : t("storageRefused");
    return apiError(error);
  };
  const percent = Math.round(progress * 100);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <FieldSet disabled={off}>
          <FieldLegend variant="label">{t("sensitivity")}</FieldLegend>
          <FieldDescription>{t("sensitivityHint")}</FieldDescription>
          <RadioGroup
            value={sensitivity}
            disabled={off}
            onValueChange={(value) => {
              setSensitivity(value === "notSensitive" ? "notSensitive" : "sensitive");
            }}
          >
            {SENSITIVITIES.map((choice) => (
              // The whole card picks the choice; the radio is named by its title and described by its hint.
              <FieldLabel key={choice} htmlFor={`${id}-${choice}`}>
                <Field orientation="horizontal">
                  <RadioGroupItem
                    value={choice}
                    id={`${id}-${choice}`}
                    aria-labelledby={`${id}-${choice}-title`}
                    aria-describedby={`${id}-${choice}-hint`}
                  />
                  <FieldContent>
                    <FieldTitle id={`${id}-${choice}-title`}>{t(choice)}</FieldTitle>
                    <FieldDescription id={`${id}-${choice}-hint`}>{t(`${choice}Hint`)}</FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>
        </FieldSet>
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
            disabled={off}
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
        {upload.isPending && (
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
          <div className="flex flex-col items-start gap-2">
            <Alert variant="destructive">
              <AlertDescription>{failure(upload.error)}</AlertDescription>
            </Alert>
            <Button
              type="button"
              variant="outline"
              aria-label={t("tryAgainName", { name: upload.variables.file.name })}
              disabled={!write.allowed}
              onClick={() => {
                send(upload.variables);
              }}
            >
              {tCommon("tryAgain")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
