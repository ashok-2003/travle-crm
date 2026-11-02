"use client";

// The "Fill with AI" button of a form, its sheet, and "Undo AI fill" once something is applied. Hidden where the AI isn't on
// for the member, the plan or the agency; held, with the form's own hint, where the subscription refuses the form's save.
import type { FillPath, FillTarget } from "@travel-crm/contracts/ai";
import { SparklesIcon, Undo2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useWriteAccess } from "@/subscription/write-access";
import { AiFillSheet } from "./ai-fill-sheet";
import type { FillMarks } from "./use-fill-marks";
import { useFillAvailable } from "./use-ai-fill";

export function FillWithAi({
  target,
  subjectId,
  marks,
  chatId,
  startOpen = false,
  onApply,
  extraCurrent,
}: {
  target: FillTarget;
  subjectId?: string;
  marks: FillMarks;
  /** A chat to read as soon as the sheet opens. */
  chatId?: string | undefined;
  startOpen?: boolean;
  /** Extra work when the ticked fields are applied (the call note keeps the lead's trip changes apart). */
  onApply?: (...args: Parameters<FillMarks["apply"]>) => void;
  /** What other values than the form's own hold now (the lead's trip, beside a call note), shown beside the AI's. */
  extraCurrent?: Partial<Record<FillPath, unknown>>;
}) {
  const t = useTranslations("ai.fill");
  const available = useFillAvailable(target);
  const write = useWriteAccess("change");
  const [open, setOpen] = useState(startOpen);
  const opener = useRef<HTMLButtonElement>(null);
  if (!available) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        ref={opener}
        type="button"
        variant="outline"
        disabled={!write.allowed}
        onClick={() => {
          setOpen(true);
        }}
      >
        <SparklesIcon aria-hidden="true" />
        {t("button")}
      </Button>
      {marks.active && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            marks.undo();
          }}
        >
          <Undo2Icon aria-hidden="true" />
          {t("undo")}
        </Button>
      )}
      <AiFillSheet
        target={target}
        subjectId={subjectId}
        open={open}
        onOpenChange={setOpen}
        current={{ ...extraCurrent, ...marks.current() }}
        chatId={chatId}
        returnFocusTo={opener}
        onApply={(proposal, ticked) => {
          (onApply ?? marks.apply)(proposal, ticked);
        }}
      />
    </div>
  );
}
