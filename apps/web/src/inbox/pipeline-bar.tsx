"use client";

// The pipeline at a glance atop the chats (sales inbox spec 6): how many chats sit at each stage of their lead, New to
// Won, each as its stage's dot and a count, so a sales manager sees the funnel without leaving the inbox.
import type { InboxSummary } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import { StageDot } from "@/leads/stage-badge";

const order = ["new", "contacted", "quote_sent", "booking_requested", "won"] as const;

export function PipelineBar({ summary }: { summary: InboxSummary }) {
  const t = useTranslations("inbox");
  const names = useTranslations("inbox.pipelineStages");
  return (
    <dl aria-label={t("pipeline")} className="grid grid-cols-5 gap-1 rounded-lg bg-chat-bar p-1.5">
      {order.map((stage) => (
        // The count shows above its stage's name, though the name comes first for a screen reader.
        <div key={stage} className="flex min-w-0 flex-col-reverse items-center rounded-md px-1 py-1 text-center">
          <dt className="flex max-w-full items-center justify-center gap-1 text-caption text-muted-foreground">
            <StageDot stage={stage} />
            <span className="wrap-break-word">{names(stage)}</span>
          </dt>
          <dd className="numbers text-section font-semibold">{summary.stages[stage]}</dd>
        </div>
      ))}
    </dl>
  );
}
