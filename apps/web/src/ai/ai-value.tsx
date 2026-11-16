"use client";

// A lead value the AI wrote, in the people violet, with where it came from a tap away and, for a member who may edit the
// lead, "Looks right" / "Not right". One trip row may hold two fields (Travellers: adults and children's ages), so a
// decision covers the fields given. A person's own edit or a decision makes the value plain at the next read.
import type { SuggestedLeadField } from "@travel-crm/contracts/ai";
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, type ReactElement, type ReactNode } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { WriteHint } from "@/subscription/write-hint";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDay } from "@/lib/format";
import { useHolds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { useDecideLeadAiFields } from "./use-ai";

export function AiValue({
  leadId,
  fields,
  filledAt,
  excerpt,
  children,
}: {
  leadId: string;
  fields: SuggestedLeadField[];
  filledAt: string;
  excerpt: string;
  children: ReactNode;
}): ReactElement {
  const t = useTranslations("leads.lead.trip.ai");
  const { timeZone } = useMe().organization;
  const canEdit = useHolds("leads:edit");
  const write = useWriteAccess("change");
  const decide = useDecideLeadAiFields(leadId);
  const hintId = useId();
  const day = formatDay(new Date(filledAt), { timeZone });
  const decideFields = (decision: "confirm" | "dismiss") => {
    decide.mutate({ leadId, decision, fields });
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span data-ai-filled className="rounded-badge bg-people-tint px-1 text-people-tint-ink">
        {children}
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("where")}
            className="relative size-5 after:absolute after:-inset-3"
          >
            <SparklesIcon aria-hidden="true" className="text-people-tint-ink" />
          </Button>
        </PopoverTrigger>
        <PopoverContent collisionPadding={16} aria-label={t("where")} className="flex flex-col gap-3">
          <p className="text-pretty">
            {excerpt === "" ? t("filledNoWords", { day }) : t("filled", { day, words: excerpt })}
          </p>
          {canEdit && (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={decide.isPending || !write.allowed}
                  aria-describedby={write.allowed ? undefined : hintId}
                  onClick={() => {
                    decideFields("confirm");
                  }}
                >
                  {t("right")}
                </Button>
                <Button
                  variant="ghost"
                  disabled={decide.isPending || !write.allowed}
                  aria-describedby={write.allowed ? undefined : hintId}
                  onClick={() => {
                    decideFields("dismiss");
                  }}
                >
                  {t("wrong")}
                </Button>
              </div>
              <WriteHint id={hintId} hint={write.hint} />
              <RefusalAlert error={decide.error} />
            </>
          )}
        </PopoverContent>
      </Popover>
    </span>
  );
}
