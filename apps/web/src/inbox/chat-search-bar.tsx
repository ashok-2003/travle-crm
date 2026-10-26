"use client";

// Search in a chat (sales inbox spec 6), under its bar: words to find (two letters or more), and Starred to show only the
// messages the team starred. While it is open the chat shows only what matches; Esc or Close puts the whole chat back.
import { StarIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Toggle } from "@/components/ui/toggle";
import type { MessageFilter } from "./use-inbox";

export function ChatSearchBar({
  filter,
  onChange,
  onClose,
}: {
  filter: MessageFilter;
  onChange: (filter: MessageFilter) => void;
  onClose: () => void;
}) {
  const t = useTranslations("inbox.chat");
  return (
    <div className="flex shrink-0 items-center gap-2 bg-surface px-2 pb-2 md:px-4">
      <InputGroup className="bg-background">
        <InputGroupInput
          type="search"
          autoFocus
          aria-label={t("searchLabel")}
          placeholder={t("searchPlaceholder")}
          value={filter.search}
          onChange={(event) => {
            onChange({ ...filter, search: event.target.value });
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
          }}
        />
        <InputGroupAddon align="inline-end">
          <Toggle
            aria-label={t("starredOnly")}
            pressed={filter.starredOnly}
            onPressedChange={(starredOnly) => {
              onChange({ ...filter, starredOnly });
            }}
          >
            <StarIcon aria-hidden="true" />
          </Toggle>
        </InputGroupAddon>
      </InputGroup>
      <Button type="button" variant="ghost" size="icon" aria-label={t("closeSearch")} onClick={onClose}>
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
