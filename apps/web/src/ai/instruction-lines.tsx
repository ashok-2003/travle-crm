"use client";

// Ready-made lines for the AI's instructions: a click adds one to the end of what is written, unless it is there already.
// The instructions hold up to 4,000 characters, so a line that would not fit is left disabled.
import { AI_INSTRUCTIONS_MAX } from "@travel-crm/contracts/ai";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

const lineKeys = [
  "dates",
  "pickup",
  "twoOptions",
  "honeymoon",
  "advance",
  "noDiscount",
  "budget",
  "itinerary",
] as const;

export function InstructionLines({
  instructions,
  disabled,
  onChange,
}: {
  instructions: string;
  disabled: boolean;
  onChange: (instructions: string) => void;
}) {
  const t = useTranslations("ai.settings");
  const current = instructions.trim();
  return (
    <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label={t("linesLabel")}>
      {lineKeys.map((key) => {
        const line = t(`lines.${key}`);
        const next = current === "" ? line : `${current}\n${line}`;
        return (
          <Button
            key={key}
            type="button"
            variant="secondary"
            size="sm"
            className="h-auto min-h-9 max-w-full justify-start rounded-full py-1.5 text-left whitespace-normal"
            disabled={disabled || current.includes(line) || next.length > AI_INSTRUCTIONS_MAX}
            onClick={() => {
              onChange(next);
            }}
          >
            <PlusIcon aria-hidden="true" />
            {line}
          </Button>
        );
      })}
    </div>
  );
}
