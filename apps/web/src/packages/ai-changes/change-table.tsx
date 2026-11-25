"use client";

// The table of exact changes: a tick, What, Now and New for each. A change with a flag (not in the message, another trip's
// line, a cancelled or booked departure...) starts unticked and shows its reason in red; one the role may not make can't be ticked.
import type { PackageDetail } from "@travel-crm/contracts/quotes";
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

/** Where a cited line came from: photo N is read from the ref "P<N>.L<m>". */
const photoNumber = (ref: string) => /^P(\d+)\./.exec(ref)?.[1] ?? "1";

export function ChangeTable({
  changes,
  ticked,
  onTickedChange,
  seasons,
}: {
  changes: ProposedChange[];
  ticked: string[];
  onTickedChange: (ids: string[]) => void;
  /** The trip's seasons, to name a price change's season by its dates. */
  seasons?: PackageDetail["seasons"] | undefined;
}) {
  const t = useTranslations("packages.aiChanges");
  const wordsOf = useChangeWords(seasons);
  const sourceOf = (line: { kind: string; ref: string }) =>
    t(`evidence.${line.kind as "message" | "pdf" | "photo" | "answer"}`, { n: photoNumber(line.ref) });
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
                {change.evidence.slice(0, 2).map((line) => (
                  <div key={line.ref} className="line-clamp-2 text-caption text-muted-foreground">
                    {t("evidence.from", { text: line.text, source: sourceOf(line) })}
                  </div>
                ))}
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
