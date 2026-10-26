"use client";

// The file waiting in the reply box (spec 3.2): its name and a way to take it off. The words in the box become its caption.
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemTitle } from "@/components/ui/item";

export function AttachedFile({ file, busy, onRemove }: { file: File; busy: boolean; onRemove: () => void }) {
  const t = useTranslations("inbox.chat.composer");
  return (
    <Item variant="muted" size="sm">
      <ItemContent>
        <ItemTitle className="wrap-anywhere">{file.name}</ItemTitle>
      </ItemContent>
      <ItemActions>
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
      </ItemActions>
    </Item>
  );
}
