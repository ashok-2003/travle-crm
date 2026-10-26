"use client";

// The emoji button beside the clip, on a computer only (a phone's keyboard has its own emoji): the picker opens in a popover and
// the chosen emoji goes in at the cursor. The emoji data is ours, served from /emojibase (public/emojibase, copied from the
// pinned emojibase-data), never fetched from a CDN, which the content security policy would refuse.
import { SmileIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmojiPicker, EmojiPickerContent, EmojiPickerFooter, EmojiPickerSearch } from "@/components/ui/emoji-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function EmojiButton({ onPick, disabled }: { onPick: (emoji: string) => void; disabled: boolean }) {
  const t = useTranslations("inbox.chat.composer");
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          aria-label={t("emoji")}
          disabled={disabled}
        >
          <SmileIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-fit p-0">
        <EmojiPicker
          className="h-80"
          emojibaseUrl="/emojibase"
          onEmojiSelect={({ emoji }) => {
            onPick(emoji);
            setOpen(false);
          }}
        >
          <EmojiPickerSearch />
          <EmojiPickerContent />
          <EmojiPickerFooter />
        </EmojiPicker>
      </PopoverContent>
    </Popover>
  );
}
