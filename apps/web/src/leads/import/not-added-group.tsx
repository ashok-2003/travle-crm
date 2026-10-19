"use client";

// The check's "Won't be added" group (spec 3.2 step 3): one line a reason with its count, each opening to its first five
// rows as "Row 14 · Manoj Tiwari", asked for when it opens, and "and 68 more".
import { useQuery } from "@tanstack/react-query";
import type { RowReasonCode } from "@travel-crm/contracts/imports";
import { ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTRPC } from "@/data/trpc";
import { useRowReasonText } from "@/imports/row-reason-text";
import { formatCount } from "@/lib/format";

const EXAMPLES = 5;

function Examples({ importId, reason, rows }: { importId: string; reason: RowReasonCode; rows: number }) {
  const t = useTranslations("leads.import.check");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const examples = useQuery(
    trpc.leadImports.rows.queryOptions({ importId, plan: "not_added", reason, limit: EXAMPLES }),
  );
  if (examples.isError) {
    return (
      <ErrorState
        message={t("examplesFailed")}
        error={examples.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void examples.refetch()}
      />
    );
  }
  if (!examples.data) return <LoadingRows rows={2} />;
  const more = rows - examples.data.items.length;
  return (
    <ul className="flex flex-col gap-1 pb-2 text-muted-foreground">
      {examples.data.items.map((example) => (
        <li key={example.rowNumber} className="wrap-anywhere script-leading">
          {example.name === null
            ? t("rowNoName", { row: example.rowNumber })
            : t("rowExample", { row: example.rowNumber, name: example.name })}
        </li>
      ))}
      {more > 0 && <li>{t("andMore", { count: formatCount(more) })}</li>}
    </ul>
  );
}

function ReasonLine({ importId, reason, rows }: { importId: string; reason: RowReasonCode; rows: number }) {
  const [open, setOpen] = useState(false);
  const reasonText = useRowReasonText();
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="h-auto min-h-11 w-full justify-between whitespace-normal text-left">
          <span className="wrap-anywhere">{reasonText({ code: reason })}</span>
          <span className="flex items-center gap-2">
            <span className="numbers">{formatCount(rows)}</span>
            <ChevronDownIcon
              aria-hidden="true"
              className="motion-safe:transition-transform data-[open=true]:rotate-180"
              data-open={open}
            />
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3">
        <Examples importId={importId} reason={reason} rows={rows} />
      </CollapsibleContent>
    </Collapsible>
  );
}

export function NotAddedGroup({
  importId,
  notAdded,
}: {
  importId: string;
  notAdded: readonly { reason: RowReasonCode; rows: number }[];
}) {
  const t = useTranslations("leads.import.check");
  const total = notAdded.reduce((sum, { rows }) => sum + rows, 0);
  if (total === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {t("wontBeAdded")} · <span className="numbers">{formatCount(total)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col">
          {notAdded.map(({ reason, rows }) => (
            <ReasonLine key={reason} importId={importId} reason={reason} rows={rows} />
          ))}
        </div>
        <p className="text-label text-muted-foreground">{t("fixThem")}</p>
      </CardContent>
    </Card>
  );
}
