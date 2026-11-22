"use client";

// The inbox's Answered by the AI filter, which the AI agent page's Chats answered opens (/inbox?show=ai-answered): the
// chats the AI wrote in during the last 24 hours, exactly what that number counts. The address asks once: the list
// starts afresh (no search or choice kept from before narrows it), the filter is kept in the tab, and the address goes
// back to plain, so opening a chat keeps the list and Back never asks again. It shows as a chosen chip with a ✕;
// pressing it, or choosing another chip, lets it go for good.
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Toggle } from "@/components/ui/toggle";
import { AI_ANSWERED_SHOW } from "@/lib/routes";
import { keepTabValue, readTabValue } from "@/lib/tab-storage";

const KEY = "inbox.show";

/** Whether this address asks for the filter (`?show=ai-answered`, a fixed value); it is then replaced by the plain one. */
export function useAiAnsweredAsked(): boolean {
  const asked = useSearchParams().get("show") === AI_ANSWERED_SHOW;
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (asked) router.replace(pathname);
  }, [asked, pathname, router]);
  return asked;
}

/** The filter, on when the address asked for it now or the tab kept it from then. */
export function useAiAnsweredFilter(asked: boolean) {
  const [on, setOn] = useState(() => {
    if (asked) keepTabValue(KEY, AI_ANSWERED_SHOW);
    return asked || readTabValue(KEY) === AI_ANSWERED_SHOW;
  });
  const clear = () => {
    setOn(false);
    keepTabValue(KEY, "");
  };
  return { on, clear };
}

export function AiAnsweredChip({ onRemove }: { onRemove: () => void }) {
  const t = useTranslations("inbox.aiAnswered");
  const hintId = useId();
  return (
    <div className="flex items-center gap-2">
      <Toggle
        variant="outline"
        pressed
        aria-label={t("label")}
        aria-describedby={hintId}
        onPressedChange={onRemove}
        className="shrink-0 rounded-full px-3"
      >
        {t("chip")}
        <XIcon aria-hidden="true" />
      </Toggle>
      <span id={hintId} className="text-caption text-muted-foreground">
        {t("hint")}
      </span>
    </div>
  );
}
