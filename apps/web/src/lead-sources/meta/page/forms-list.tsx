"use client";

// A Page's lead forms (spec 3.3): a registry Table on a computer and an ItemGroup on a phone, each with Facebook's status,
// whether it is brought in here, the leads it added and the last one, and Bring in (or Edit questions once brought in).
// A form that had leads while it wasn't brought in says how many: they were not saved.
import type { MetaFormList, MetaFormState, MetaFormView } from "@travel-crm/contracts/meta-leads";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
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
import { useTRPC } from "@/data/trpc";
import { formatCount, formatDayTime } from "@/lib/format";
import { metaFormRoute } from "@/lib/routes";
import { useWideScreen } from "@/lib/use-wide-screen";
import { useMe } from "@/session/me-context";
import { useQuery } from "@tanstack/react-query";

const toneOf: Record<Exclude<MetaFormState, "not_brought_in">, StatusTone> = {
  running: "good",
  paused: "neutral",
  needs_attention: "attention",
};

const knownStatuses = new Set(["ACTIVE", "ARCHIVED", "DRAFT", "DELETED"]);

export function FormsList({ pageId }: { pageId: string }) {
  const t = useTranslations("metaLeads.forms");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const wide = useWideScreen();
  const { timeZone } = useMe().organization;
  const forms = useQuery(trpc.metaLeads.forms.queryOptions({ pageId }));

  const statusText = (form: MetaFormView) =>
    knownStatuses.has(form.metaStatus) ? t(`metaStatus.${form.metaStatus as "ACTIVE"}`) : t("metaStatusOther");
  const lastLead = (form: MetaFormView) =>
    form.lastLeadAt === null ? t("noLead") : formatDayTime(new Date(form.lastLeadAt), { timeZone });
  const state = (form: MetaFormView) =>
    form.state === "not_brought_in" ? (
      <span className="text-muted-foreground">{t("states.not_brought_in")}</span>
    ) : (
      <StatusBadge tone={toneOf[form.state]}>{t(`states.${form.state}`)}</StatusBadge>
    );
  const action = (form: MetaFormView) =>
    form.state === "not_brought_in" ? (
      <Button variant="outline" asChild>
        <Link href={metaFormRoute(pageId, form.id, "bring-in")} aria-label={t("bringInForm", { form: form.name })}>
          {t("bringIn")}
        </Link>
      </Button>
    ) : (
      <Button variant="ghost" asChild>
        <Link href={metaFormRoute(pageId, form.id, "questions")} aria-label={t("editQuestionsOf", { form: form.name })}>
          {t("editQuestions")}
        </Link>
      </Button>
    );
  const skipped = (form: MetaFormView) =>
    form.state === "not_brought_in" && form.skippedLeads > 0 ? t("skipped", { count: form.skippedLeads }) : null;

  const body = (list: MetaFormList) => {
    if (list.items.length === 0) return <p className="text-muted-foreground">{t("empty")}</p>;
    if (!wide) {
      return (
        <ItemGroup aria-label={t("listLabel")}>
          {list.items.map((form, index) => (
            <Fragment key={form.id}>
              {index > 0 && <ItemSeparator />}
              <Item size="sm" role="listitem" className="items-start">
                <ItemContent className="min-w-0">
                  <ItemTitle className="flex-wrap wrap-anywhere script-leading">{form.name}</ItemTitle>
                  <ItemDescription className="wrap-anywhere script-leading">
                    {statusText(form)} · {t("columns.leads")}{" "}
                    <span className="numbers">{formatCount(form.leadsAdded)}</span> · {lastLead(form)}
                  </ItemDescription>
                  {skipped(form) !== null && <ItemDescription>{skipped(form)}</ItemDescription>}
                </ItemContent>
                {state(form)}
                <ItemActions className="basis-full">{action(form)}</ItemActions>
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
            <TableHead scope="col">{t("columns.form")}</TableHead>
            <TableHead scope="col">{t("columns.status")}</TableHead>
            <TableHead scope="col">{t("columns.state")}</TableHead>
            <TableHead scope="col">{t("columns.leads")}</TableHead>
            <TableHead scope="col">{t("columns.lastLead")}</TableHead>
            <TableHead scope="col">
              <span className="sr-only">{t("columns.action")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.items.map((form) => (
            <TableRow key={form.id}>
              <TableCell className="whitespace-normal wrap-anywhere font-medium">
                {form.name}
                {skipped(form) !== null && (
                  <span className="block text-label font-normal text-muted-foreground">{skipped(form)}</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{statusText(form)}</TableCell>
              <TableCell>{state(form)}</TableCell>
              <TableCell className="numbers">{formatCount(form.leadsAdded)}</TableCell>
              <TableCell className="text-muted-foreground">{lastLead(form)}</TableCell>
              <TableCell>{action(form)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="meta-forms">
      <div className="flex flex-col gap-1">
        <h2 id="meta-forms" className="text-section font-semibold">
          {t("heading")}
        </h2>
        <p className="max-w-[65ch] text-muted-foreground">{t("intro")}</p>
      </div>
      {forms.data !== undefined ? (
        body(forms.data)
      ) : forms.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={forms.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void forms.refetch()}
        />
      ) : (
        <LoadingRows rows={3} shape="twoLines" />
      )}
    </section>
  );
}
