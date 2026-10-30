"use client";

// Marks a form's field in the people violet while it holds what the AI filled (DESIGN.md lists violet for AI helpers), with the
// words the value came from a tap away. It wraps the field where the form lays it out and shows nothing when no fill is in
// effect or the person has changed the value. It is information, never a button: the hint beside it is the only control.
import type { FillPath } from "@travel-crm/contracts/ai";
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { InfoHint } from "@/components/info-hint";
import { cn } from "@/lib/utils";
import { useMarks } from "./use-fill-marks";

export function AiMark({
  paths,
  className,
  children,
}: {
  paths: readonly FillPath[];
  /** Where the field sat in a grid, which its wrapper now sits in. */
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations("ai.fill");
  const marks = useMarks();
  const marked = paths.flatMap((path) => {
    const field = marks?.markOf(path);
    return field ? [field] : [];
  });
  const excerpt = marked.map((field) => field.excerpt).find((words) => words !== "");
  const from = marked[0]?.from ?? "text";
  // The same wrapper marked or not, so a field being typed in keeps its focus when its mark goes.
  return (
    <div
      {...(marked.length > 0 && { "data-ai-filled": true })}
      className={cn(marked.length > 0 && "flex flex-col gap-1 rounded-lg bg-people-tint/50 p-2", className)}
    >
      {children}
      {marked.length > 0 && (
        <p className="flex items-center gap-1 text-caption font-medium text-people-tint-ink">
          <SparklesIcon aria-hidden="true" className="size-3.5" />
          {t("marked", { source: t(`sources.${from}`) })}
          {excerpt !== undefined && (
            <InfoHint term={t("markedTerm")}>
              {t("markedExcerpt")} “{excerpt}”
            </InfoHint>
          )}
        </p>
      )}
    </div>
  );
}
