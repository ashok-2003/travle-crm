"use client";

// What the agency tells the AI: a text box, photos or one PDF, and Show the changes. Files are kept here until Show is
// pressed (the card uploads them), so choosing one costs nothing.
import { PaperclipIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import type { ChangeInputType } from "./use-package-changes-ai";

export const MAX_PHOTOS = 4;
const photoTypes = ["image/jpeg", "image/png", "image/webp"];
export const inputTypeOf = (file: File): ChangeInputType | null =>
  file.type === "application/pdf" || photoTypes.includes(file.type) ? (file.type as ChangeInputType) : null;

/** Up to four photos, or one PDF alone. */
export function filesAreAllowed(files: File[]): boolean {
  if (files.some((file) => inputTypeOf(file) === null)) return false;
  const pdfs = files.filter((file) => file.type === "application/pdf").length;
  return pdfs === 0 ? files.length <= MAX_PHOTOS : pdfs === 1 && files.length === 1;
}

export function ChangeInput({
  text,
  onText,
  files,
  onFiles,
  working,
  fileProblem,
  onShow,
}: {
  text: string;
  onText: (text: string) => void;
  files: File[];
  onFiles: (files: File[]) => void;
  working: boolean;
  fileProblem: boolean;
  onShow: () => void;
}) {
  const t = useTranslations("packages.aiChanges");
  const write = useWriteAccess("change");
  const picker = useRef<HTMLInputElement>(null);
  const textId = useId();
  const hintId = useId();
  const empty = text.trim() === "" && files.length === 0;
  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor={textId}>{t("textLabel")}</FieldLabel>
        <Textarea
          id={textId}
          value={text}
          rows={4}
          maxLength={8000}
          placeholder={t("textPlaceholder")}
          disabled={working}
          onChange={(event) => {
            onText(event.target.value);
          }}
        />
      </Field>
      <input
        ref={picker}
        type="file"
        hidden
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        aria-label={t("attach")}
        onChange={(event) => {
          onFiles([...files, ...Array.from(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      <ul className="flex flex-wrap gap-2">
        {files.map((file, index) => (
          <li key={`${file.name}-${String(index)}`} className="flex items-center gap-1 text-sm">
            {file.name}
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("removeFile", { name: file.name })}
              disabled={working}
              onClick={() => {
                onFiles(files.filter((_, at) => at !== index));
              }}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      {fileProblem && <p className="text-sm text-status-bad-ink">{t("badFiles")}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={working}
          onClick={() => {
            picker.current?.click();
          }}
        >
          <PaperclipIcon aria-hidden="true" />
          {t("attach")}
        </Button>
        <Button
          aria-describedby={write.hint === null ? undefined : hintId}
          disabled={working || empty || fileProblem || !write.allowed}
          onClick={onShow}
        >
          {working && <Spinner aria-hidden="true" />}
          {working ? t("working") : t("show")}
        </Button>
      </div>
      <WriteHint id={hintId} hint={write.hint} visible />
    </div>
  );
}
