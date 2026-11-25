"use client";

// What the AI proposed: the change table, the lines it left out, and Apply N changes for the ticked ones.
import { useTranslations } from "next-intl";
import { useId } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { ChangeTable } from "./change-table";
import type { ProposedChange, ProposedChanges } from "./use-package-changes-ai";

function LineList({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="list-disc pl-5 text-sm text-muted-foreground">
        {lines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

export function ProposalView({
  proposal,
  ticked,
  onTickedChange,
  applying,
  error,
  onApply,
}: {
  proposal: ProposedChanges;
  ticked: string[];
  onTickedChange: (ids: string[]) => void;
  applying: boolean;
  error: unknown;
  onApply: (changes: ProposedChange[]) => void;
}) {
  const t = useTranslations("packages.aiChanges");
  const write = useWriteAccess("change");
  const hintId = useId();
  const chosen = proposal.changes.filter((change) => ticked.includes(change.id));
  return (
    <div className="flex flex-col gap-4">
      {proposal.changes.length === 0 ? (
        proposal.questions.length === 0 && <p className="text-sm">{t("none")}</p>
      ) : (
        <>
          <ChangeTable changes={proposal.changes} ticked={ticked} onTickedChange={onTickedChange} />
          <RefusalAlert error={error} />
          <div className="flex flex-col items-start gap-2">
            <Button
              aria-describedby={write.hint === null ? undefined : hintId}
              disabled={chosen.length === 0 || applying || !write.allowed}
              onClick={() => {
                onApply(chosen);
              }}
            >
              {applying && <Spinner aria-hidden="true" />}
              {applying ? t("applying") : t("apply", { count: chosen.length })}
            </Button>
            <WriteHint id={hintId} hint={write.hint} visible />
          </div>
        </>
      )}
      <LineList title={t("ignoredTitle")} lines={proposal.ignored} />
      <LineList title={t("notChangedTitle")} lines={proposal.notChanged} />
      {proposal.brochureLeftOut && <p className="text-sm text-muted-foreground">{t("brochureLeftOut")}</p>}
    </div>
  );
}
