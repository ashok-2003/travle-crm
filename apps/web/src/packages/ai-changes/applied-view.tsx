"use client";

// After Apply: "N changes applied" with the list and Undo all (which asks first), and after Undo all, what was put back
// and which departures stayed as they are.
import type { UndoPackageChangesResult } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { formatCalendarDay } from "@/lib/format";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { useChangeWords } from "./change-row-words";
import { useUndoChanges, type ProposedChange } from "./use-package-changes-ai";

export function AppliedView({
  runId,
  count,
  changes,
  onUndone,
  onAgain,
}: {
  runId: string;
  count: number;
  /** What was applied, when this screen applied it; unknown when the page is opened later. */
  changes: ProposedChange[] | null;
  onUndone: (result: UndoPackageChangesResult) => void;
  onAgain: () => void;
}) {
  const t = useTranslations("packages.aiChanges");
  const wordsOf = useChangeWords();
  const write = useWriteAccess("change");
  const hintId = useId();
  const [asking, setAsking] = useState(false);
  const undo = useUndoChanges(onUndone);
  return (
    <div className="flex flex-col gap-4">
      <p className="font-medium">{t("applied", { count })}</p>
      {changes !== null && (
        <ul className="list-disc pl-5 text-sm">
          {changes.map((change) => (
            <li key={change.id}>{wordsOf(change).what}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          aria-describedby={write.hint === null ? undefined : hintId}
          disabled={!write.allowed}
          onClick={() => {
            setAsking(true);
          }}
        >
          {t("undoAll")}
        </Button>
        <Button variant="link" onClick={onAgain}>
          {t("again")}
        </Button>
      </div>
      <WriteHint id={hintId} hint={write.hint} visible />
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={t("undoTitle")}
        description={t("undoDescription")}
        action={t("undoAll")}
        request={undo}
        onConfirm={() => {
          undo.mutate({ runId });
        }}
      />
    </div>
  );
}

export function UndoneView({ result, onAgain }: { result: UndoPackageChangesResult; onAgain: () => void }) {
  const t = useTranslations("packages.aiChanges");
  return (
    <div className="flex flex-col gap-4">
      <p className="font-medium">{t("undone", { count: result.undone })}</p>
      {result.kept.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">{t("keptTitle")}</h3>
          <ul className="list-disc pl-5 text-sm">
            {result.kept.map((departure) => (
              <li key={departure.departureId}>
                {t(`kept.${departure.reason}`, { day: formatCalendarDay(departure.startDate) })}
              </li>
            ))}
          </ul>
        </section>
      )}
      <Button variant="link" className="self-start" onClick={onAgain}>
        {t("again")}
      </Button>
    </div>
  );
}
