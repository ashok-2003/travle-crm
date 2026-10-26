"use client";

// The file waiting in the reply box (spec 3.2): a small picture of it when it is one, its name and a way to take it off. The
// words in the box become its caption. While it goes up, its progress shows in place of the name's weight, with Cancel.
import { FileIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";

export function AttachedFile({
  file,
  busy,
  progress,
  onRemove,
  onCancel,
}: {
  file: File;
  busy: boolean;
  /** 0 to 1 while the file goes up, else null. */
  progress: number | null;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("inbox.chat.composer");
  const [preview, setPreview] = useState<string | null>(null);
  // Read in the background, so the picture shows a moment after the file is chosen; a callback sets it, never the effect itself.
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(typeof reader.result === "string" ? reader.result : null);
    };
    reader.readAsDataURL(file);
    return () => {
      reader.abort();
    };
  }, [file]);
  const percent = progress === null ? null : Math.round(progress * 100);
  return (
    <Item variant="muted" size="sm">
      <ItemMedia variant="image">
        {preview === null ? (
          <FileIcon aria-hidden="true" />
        ) : (
          // The member's own picture, from memory: not an optimised Next image.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-full object-cover" />
        )}
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="wrap-anywhere">{file.name}</ItemTitle>
        {percent !== null && (
          <ItemDescription className="flex items-center gap-2">
            <Progress value={percent} aria-label={t("uploading", { percent })} className="max-w-40" />
            {t("uploading", { percent })}
          </ItemDescription>
        )}
      </ItemContent>
      <ItemActions>
        {percent !== null ? (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {t("cancelUpload")}
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("removeFile")}
            disabled={busy}
            onClick={onRemove}
          >
            <XIcon aria-hidden="true" />
          </Button>
        )}
      </ItemActions>
    </Item>
  );
}
