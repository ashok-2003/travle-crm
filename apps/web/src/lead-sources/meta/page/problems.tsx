"use client";

// The leads that couldn't be added (spec 3.3): a Table on a computer and an ItemGroup on a phone, each with the name it
// had, its reasons, the platform and the day it was first seen, and Check again (the lead is read from Meta once more) and
// Hide. Fifty at a time. A line goes by itself once the lead is added; Facebook's copy is never touched.
import { useMutation } from "@tanstack/react-query";
import type { MetaProblemView } from "@travel-crm/contracts/meta-leads";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { toast } from "sonner";
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
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useCursorPages } from "@/data/use-cursor-pages";
import { focusPageHeading } from "@/lib/focus-page-heading";
import { formatDay } from "@/lib/format";
import { useWideScreen } from "@/lib/use-wide-screen";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { useRefreshMeta } from "../use-meta-pages";

export function Problems({ pageId }: { pageId: string }) {
  const t = useTranslations("metaLeads.problems");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const client = useTRPCClient();
  const wide = useWideScreen();
  const write = useWriteAccess("change");
  const refresh = useRefreshMeta();
  const { timeZone } = useMe().organization;
  const problems = useCursorPages({
    queryKey: [...trpc.metaLeads.problems.pathKey(), { pageId }],
    page: async (cursor) => {
      const page = await client.metaLeads.problems.query(cursor === null ? { pageId } : { pageId, after: cursor });
      return { items: page.items, nextCursor: page.next };
    },
    items: (page) => page.items,
  });
  // A hidden or fixed line takes its buttons with it: the focus goes to this list's heading, or, with none left, the page's.
  const settle = async () => {
    if ((problems.items?.length ?? 0) > 1) document.getElementById("meta-problems")?.focus({ preventScroll: true });
    else focusPageHeading();
    await refresh();
  };
  const hide = useMutation(trpc.metaLeads.hideProblem.mutationOptions({ onSuccess: settle }));
  const again = useMutation(
    trpc.metaLeads.retryLead.mutationOptions({
      onSuccess: async ({ result }) => {
        if (result === "added") toast.success(t("checkedAdded"));
        else if (result === "merged") toast.success(t("checkedMerged"));
        else if (result === "settled") toast.success(t("checkedSettled"));
        else toast.error(t("checkedNotAdded"));
        await refresh();
      },
    }),
  );

  const day = (problem: MetaProblemView) => formatDay(new Date(problem.firstSeenAt), { timeZone });
  const who = (problem: MetaProblemView) => problem.exampleName ?? t("noName");
  const why = (problem: MetaProblemView) => problem.reasons.map((reason) => t(`reasons.${reason}`)).join(". ");
  const buttons = (problem: MetaProblemView) => (
    <>
      <Button
        variant="outline"
        aria-label={t("checkAgainLead", { name: who(problem) })}
        disabled={!write.allowed || again.isPending}
        onClick={() => {
          again.mutate({ pageId, leadRowId: problem.id });
        }}
      >
        {t("checkAgain")}
      </Button>
      <Button
        variant="ghost"
        aria-label={t("hideLead", { name: who(problem) })}
        disabled={!write.allowed || hide.isPending}
        onClick={() => {
          hide.mutate({ pageId, leadRowId: problem.id });
        }}
      >
        {t("hide")}
      </Button>
    </>
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
              <Item size="sm" role="listitem" className="items-start">
                <ItemContent className="min-w-0">
                  <ItemTitle className="flex-wrap wrap-anywhere script-leading">{who(problem)}</ItemTitle>
                  <ItemDescription>{why(problem)}</ItemDescription>
                  <ItemDescription>
                    {problem.platform === null ? null : `${t(`platforms.${problem.platform}`)} · `}
                    {t("firstSeen", { day: day(problem) })}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="basis-full">{buttons(problem)}</ItemActions>
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
              <TableCell className="whitespace-normal wrap-anywhere font-medium">{who(problem)}</TableCell>
              <TableCell className="whitespace-normal">{why(problem)}</TableCell>
              <TableCell className="text-muted-foreground">{day(problem)}</TableCell>
              <TableCell>
                <div className="flex gap-1">{buttons(problem)}</div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="meta-problems">
      <h2 id="meta-problems" tabIndex={-1} className="text-section font-semibold">
        {t("heading")}
      </h2>
      {body()}
      <ShowMoreButton pages={problems} label={t("more")} />
      <RefusalAlert error={hide.error ?? again.error} />
      <p className="text-label text-muted-foreground">{t("help")}</p>
    </section>
  );
}
