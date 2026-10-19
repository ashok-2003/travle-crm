"use client";

// The rows a sheet couldn't add (S27, S31): a Table on a computer and an ItemGroup on a phone, each with its row number,
// the name or value it had, the reason and the day it was first seen, and Hide. Fifty at a time. The line goes by itself
// when the row is fixed or deleted in the sheet; we never change the sheet.
import { useMutation } from "@tanstack/react-query";
import type { SheetProblem } from "@travel-crm/contracts/sheets";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { ShowMoreButton } from "@/components/show-more-button";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCursorPages } from "@/data/use-cursor-pages";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { formatDay } from "@/lib/format";
import { useWideScreen } from "@/lib/use-wide-screen";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { useRefreshLeadSheets } from "../use-lead-sheets";

export function SheetProblems({ sheetId }: { sheetId: string }) {
  const t = useTranslations("sheets.sheet.problems");
  const tReasons = useTranslations("sheets.reasons");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const client = useTRPCClient();
  const wide = useWideScreen();
  const write = useWriteAccess("change");
  const refresh = useRefreshLeadSheets();
  const { timeZone } = useMe().organization;
  const problems = useCursorPages({
    queryKey: [...trpc.leadSheets.problems.pathKey(), { sheetId }],
    page: (cursor) => client.leadSheets.problems.query(cursor === null ? { sheetId } : { sheetId, after: cursor }),
    items: (page) => page.items,
  });
  const hide = useMutation(trpc.leadSheets.hideProblem.mutationOptions({ onSuccess: refresh }));

  const day = (problem: SheetProblem) => formatDay(new Date(problem.firstSeenAt), { timeZone });
  const who = (problem: SheetProblem) => problem.name ?? problem.value ?? t("noName");
  const hideButton = (problem: SheetProblem) => (
    <Button
      variant="ghost"
      aria-label={t("hideRow", { number: problem.rowNumber })}
      disabled={!write.allowed || hide.isPending}
      onClick={() => {
        hide.mutate({ sheetId, rowId: problem.id });
      }}
    >
      {t("hide")}
    </Button>
  );

  const body = () => {
    if (problems.items === undefined) {
      if (problems.isError) {
        return (
          <ErrorState
            message={t("loadFailed")}
            error={problems.error}
            retryLabel={tCommon("tryAgain")}
            onRetry={() => void problems.refetch()}
          />
        );
      }
      return <LoadingRows rows={3} shape="twoLines" />;
    }
    if (!wide) {
      return (
        <ItemGroup aria-label={t("listLabel")}>
          {problems.items.map((problem, index) => (
            <Fragment key={problem.id}>
              {index > 0 && <ItemSeparator />}
              <Item size="sm" role="listitem">
                <ItemContent className="min-w-0">
                  <ItemTitle className="flex-wrap wrap-anywhere script-leading">
                    {t("row", { number: problem.rowNumber })} · {who(problem)}
                  </ItemTitle>
                  <ItemDescription>
                    {tReasons(problem.reason)} · {t("firstSeen", { day: day(problem) })}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>{hideButton(problem)}</ItemActions>
              </Item>
            </Fragment>
          ))}
        </ItemGroup>
      );
    }
    return (
      <Table aria-label={t("listLabel")}>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t("columns.row")}</TableHead>
            <TableHead scope="col">{t("columns.name")}</TableHead>
            <TableHead scope="col">{t("columns.why")}</TableHead>
            <TableHead scope="col">{t("columns.firstSeen")}</TableHead>
            <TableHead scope="col">
              <span className="sr-only">{t("columns.action")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {problems.items.map((problem) => (
            <TableRow key={problem.id}>
              <TableCell className="numbers">{problem.rowNumber}</TableCell>
              <TableCell className="whitespace-normal wrap-anywhere">{who(problem)}</TableCell>
              <TableCell className="whitespace-normal">{tReasons(problem.reason)}</TableCell>
              <TableCell className="text-muted-foreground">{day(problem)}</TableCell>
              <TableCell>{hideButton(problem)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="sheet-problems">
      <h2 id="sheet-problems" className="text-section font-semibold">
        {t("heading")}
      </h2>
      {body()}
      <ShowMoreButton pages={problems} label={t("more")} />
      <RefusalAlert error={hide.error} />
      <p className="text-label text-muted-foreground">{t("help")}</p>
    </section>
  );
}
