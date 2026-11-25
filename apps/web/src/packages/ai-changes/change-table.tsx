"use client";

// The table of exact changes: a tick, What, Now and New for each. A change with a flag (not in the message, another trip's
// line, a cancelled or booked departure...) starts unticked and shows its reason in red; one the role may not make can't be ticked.
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useChangeWords } from "./change-row-words";
import type { ProposedChange } from "./use-package-changes-ai";

/** The ids a table starts with ticked: the changes with nothing to check. */
export const cleanChangeIds = (changes: ProposedChange[]) =>
  changes.filter((change) => change.flags.length === 0).map((change) => change.id);

function Lines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <div key={index} className="whitespace-pre-line">
          {line}
        </div>
      ))}
    </>
  );
}

export function ChangeTable({
  changes,
  ticked,
  onTickedChange,
}: {
  changes: ProposedChange[];
  ticked: string[];
  onTickedChange: (ids: string[]) => void;
}) {
  const t = useTranslations("packages.aiChanges");
  const wordsOf = useChangeWords();
  return (
    <Table aria-label={t("tableLabel")}>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columns.apply")}</TableHead>
          <TableHead>{t("columns.what")}</TableHead>
          <TableHead>{t("columns.now")}</TableHead>
          <TableHead>{t("columns.next")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {changes.map((change) => {
          const words = wordsOf(change);
          const flagged = change.flags.length > 0;
          return (
            <TableRow key={change.id}>
              <TableCell className="align-top">
                <Checkbox
                  aria-label={t("tick", { what: words.what })}
                  checked={ticked.includes(change.id)}
                  disabled={change.flags.includes("not_allowed")}
                  onCheckedChange={(on) => {
                    onTickedChange(on === true ? [...ticked, change.id] : ticked.filter((id) => id !== change.id));
                  }}
                />
              </TableCell>
              <TableCell className="align-top whitespace-normal">
                <div className={flagged ? "text-status-bad-ink" : undefined}>{words.what}</div>
                {change.flags.map((flag) => (
                  <div key={flag} className="text-caption text-status-bad-ink">
                    {t(`flags.${flag}`)}
                  </div>
                ))}
              </TableCell>
              <TableCell className="align-top whitespace-normal">
                <Lines lines={words.now} />
              </TableCell>
              <TableCell className="align-top whitespace-normal">
                <Lines lines={words.next} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
