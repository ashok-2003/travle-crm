"use client";

// The fields that say what the AI should read: a box for words, the mic, and (where allowed) a picture; with the recording or
// picture chosen shown and removable. One piece for every fill sheet, so they look and behave alike.
import { MicIcon, PaperclipIcon, SquareIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, type ClipboardEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, type FillSourceState, type ImageType } from "./use-fill-source";

export function FillSourceFields({
  source,
  textLabel,
  textHint,
  imageLabel,
  allowImage = true,
  busy,
}: {
  source: FillSourceState;
  textLabel: string;
  textHint: string;
  /** What the picture button says; a picture is not offered when `allowImage` is off. */
  imageLabel?: string | undefined;
  allowImage?: boolean;
  busy: boolean;
}) {
  const t = useTranslations("ai.fill.sheet");
  const picker = useRef<HTMLInputElement>(null);
  const { recorder, media } = source;
  const clock = `${String(Math.floor(recorder.seconds / 60))}:${String(recorder.seconds % 60).padStart(2, "0")}`;

  const chooseImage = (file: File | undefined) => {
    if (file === undefined) return;
    if (!IMAGE_TYPES.includes(file.type as ImageType) || file.size > MAX_IMAGE_BYTES) {
      toast.error(t("imageRefused"));
      return;
    }
    source.setMedia({ blob: file, type: file.type as ImageType });
  };
  const onPaste = (event: ClipboardEvent) => {
    if (!allowImage) return;
    const image = [...event.clipboardData.files].find((file) => file.type.startsWith("image/"));
    if (image !== undefined) {
      event.preventDefault();
      chooseImage(image);
    }
  };

  return (
    <>
      <Field>
        <FieldLabel htmlFor="ai-fill-text">{textLabel}</FieldLabel>
        <Textarea
          id="ai-fill-text"
          rows={5}
          value={source.text}
          disabled={busy}
          onChange={(event) => {
            source.setText(event.target.value);
          }}
          onPaste={onPaste}
        />
        <FieldDescription>{textHint}</FieldDescription>
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            if (recorder.recording) recorder.stop();
            else void recorder.start();
          }}
        >
          {recorder.recording ? <SquareIcon aria-hidden="true" /> : <MicIcon aria-hidden="true" />}
          {recorder.recording ? t("micStop", { time: clock }) : t("mic")}
        </Button>
        {allowImage && (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy || recorder.recording}
              onClick={() => picker.current?.click()}
            >
              <PaperclipIcon aria-hidden="true" />
              {imageLabel ?? t("addImage")}
            </Button>
            <input
              ref={picker}
              type="file"
              accept={IMAGE_TYPES.join(",")}
              className="sr-only"
              tabIndex={-1}
              aria-label={imageLabel ?? t("addImage")}
              onChange={(event) => {
                chooseImage(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </>
        )}
      </div>
      {recorder.problem !== null && (
        <p role="alert" className="text-destructive">
          {t(
            recorder.problem === "denied"
              ? "micDenied"
              : recorder.problem === "unsupported"
                ? "micUnsupported"
                : "micUnreadable",
          )}
        </p>
      )}
      {media !== null && (
        <p className="flex items-center gap-2">
          <span>{t(media.type === "audio/wav" ? "recordingReady" : "imageReady")}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              source.setMedia(null);
            }}
          >
            <XIcon aria-hidden="true" />
            {t("remove")}
          </Button>
        </p>
      )}
    </>
  );
}
