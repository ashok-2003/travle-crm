"use client";

// Save (spec 3.2): the form's one button. On a phone it stays above the bottom bar while the cards scroll. It is off
// when nothing changed and, with its reason as its description, while the subscription refuses changes.
import { useTranslations } from "next-intl";
import { useId } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";

export function SaveBar({ dirty, saving, error }: { dirty: boolean; saving: boolean; error: unknown }) {
  const t = useTranslations("websiteFormSettings.save");
  const write = useWriteAccess("change");
  const hintId = useId();
  return (
    <div className="flex flex-col gap-2">
      <RefusalAlert error={error} />
      <div className="sticky bottom-[var(--phone-navigation-height,0px)] z-(--z-sticky) -mx-4 flex flex-col items-start gap-2 bg-background px-4 py-3 sm:-mx-6 sm:px-6 md:static md:mx-0 md:px-0">
        <Button
          type="submit"
          disabled={!dirty || saving || !write.allowed}
          aria-describedby={write.hint === null ? undefined : hintId}
        >
          {saving ? t("saving") : t("save")}
        </Button>
        <WriteHint id={hintId} hint={write.hint} />
      </div>
    </div>
  );
}
