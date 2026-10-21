"use client";

// The staff import's third step (spec 3.4, B44, B45): what will happen to every row of the file. The people who will be
// added with how they sign in; every row left out with its reason, "Already on your staff" apart (a staff file is short,
// so none is hidden); and the seats. Add asks once, then the browser makes the passwords and the job adds everyone in
// one go. Over the plan's seats Add is off and says why. A try the add sent back here says so and what changed.
import { useQuery } from "@tanstack/react-query";
import { brand } from "@travel-crm/brand";
import type { ImportRow } from "@travel-crm/contracts/imports";
import { CircleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Fragment, useId, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { TextLink } from "@/components/text-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { useTRPC } from "@/data/trpc";
import { useRowReasonText } from "@/imports/row-reason-text";
import { formatCount } from "@/lib/format";
import { routes } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { useAddStaffImport, useCancelStaffImport, type StaffImportPage } from "./use-staff-import";

/** How many of the people to be added are named before "and 8 more". */
const NAMED = 4;

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const id = useId();
  return (
    <section className="flex flex-col gap-2" aria-labelledby={id}>
      <h2 id={id} className="text-section font-semibold">
        {title} · <span className="numbers">{formatCount(count)}</span>
      </h2>
      {children}
    </section>
  );
}

function People({ rows, lines }: { rows: readonly ImportRow[]; lines: (row: ImportRow) => ReactNode }) {
  return (
    <ItemGroup>
      {rows.map((row, index) => (
        <Fragment key={row.rowNumber}>
          {index > 0 && <ItemSeparator />}
          <Item size="sm" role="listitem">
            <ItemContent>
              <ItemTitle className="wrap-anywhere script-leading">{row.name ?? ""}</ItemTitle>
              <ItemDescription className="wrap-anywhere script-leading">{lines(row)}</ItemDescription>
            </ItemContent>
          </Item>
        </Fragment>
      ))}
    </ItemGroup>
  );
}

export function StaffCheckStep({ page, onChangeColumns }: { page: StaffImportPage; onChangeColumns: () => void }) {
  const t = useTranslations("staff.import.check");
  const tImports = useTranslations("imports");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const trpc = useTRPC();
  const reasonText = useRowReasonText();
  const hintId = useId();
  const write = useWriteAccess("change");
  const [confirming, setConfirming] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const adding = useAddStaffImport(page.id, () => {
    setConfirming(false);
  });
  const cancel = useCancelStaffImport(page.id, () => {
    router.push(routes.staff);
  });
  const toAdd = useQuery(trpc.staffImports.rows.queryOptions({ importId: page.id, plan: "new", limit: 500 }));
  const left = useQuery(trpc.staffImports.rows.queryOptions({ importId: page.id, plan: "not_added", limit: 500 }));

  const count = page.progress.rowsToAdd;
  const free = page.seats.free;
  const overSeats = free !== null && count > free;
  const alreadyOnStaff = (left.data?.items ?? []).filter((row) => row.reasons[0]?.code === "already_on_staff");
  const leftOut = (left.data?.items ?? []).filter((row) => row.reasons[0]?.code !== "already_on_staff");
  const rowNumbers = (toAdd.data?.items ?? []).map((row) => row.rowNumber);
  const canAdd = count > 0 && !overSeats && rowNumbers.length === count && write.allowed;
  const returned =
    page.failureReason === "row_changed" || page.failureReason === "over_seat_limit" ? page.failureReason : null;
  const rowLine = (row: ImportRow) =>
    [
      t("row", { row: row.rowNumber }),
      ...row.reasons.slice(0, 1).map(reasonText),
      ...(row.value === null ? [] : [row.value]),
    ].join(" · ");

  const listed = (rows: readonly ImportRow[], lines: (row: ImportRow) => ReactNode) => (
    <People rows={rows} lines={lines} />
  );
  const loadedOrNot = (body: ReactNode, query: typeof toAdd) =>
    query.data ? (
      body
    ) : query.isError ? (
      <ErrorState
        message={t("rowsFailed")}
        error={query.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void query.refetch()}
      />
    ) : (
      <LoadingRows rows={2} />
    );

  return (
    <>
      <PageHeader title={tImports("steps.check")} intro={t("intro", { count: formatCount(page.progress.rowsTotal) })} />
      {returned !== null && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{t("returned", { reason: tImports(`failures.${returned}`) })}</AlertDescription>
        </Alert>
      )}
      <Section title={t("willBeAdded")} count={count}>
        {count === 0 ? (
          <p className="text-muted-foreground">{t("nothingToAdd")}</p>
        ) : (
          loadedOrNot(
            <>
              {listed((toAdd.data?.items ?? []).slice(0, NAMED), (row) => row.value ?? "")}
              {count > NAMED && (
                <p className="text-muted-foreground">{t("andMore", { count: formatCount(count - NAMED) })}</p>
              )}
            </>,
            toAdd,
          )
        )}
      </Section>
      {(leftOut.length > 0 || !left.data) && (
        <Section title={t("leftOut")} count={leftOut.length}>
          {loadedOrNot(listed(leftOut, rowLine), left)}
        </Section>
      )}
      {alreadyOnStaff.length > 0 && (
        <Section title={t("alreadyOnStaff")} count={alreadyOnStaff.length}>
          {listed(alreadyOnStaff, rowLine)}
        </Section>
      )}
      {free !== null &&
        (overSeats ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription>
              {t.rich("overSeats", {
                count: formatCount(count),
                free: formatCount(free),
                link: (chunks) => (
                  <TextLink href={`mailto:${brand.supportEmail}`} inline>
                    {chunks}
                  </TextLink>
                ),
              })}
            </AlertDescription>
          </Alert>
        ) : (
          <p>{t("seats", { count, free: formatCount(free) })}</p>
        ))}
      <div className="flex flex-col items-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            ref={addButton}
            disabled={!canAdd}
            aria-describedby={write.hint ? hintId : undefined}
            onClick={() => {
              setConfirming(true);
            }}
          >
            {t("add", { count })}
          </Button>
          <Button variant="outline" onClick={onChangeColumns}>
            {t("changeColumns")}
          </Button>
        </div>
        <WriteHint id={hintId} hint={write.hint} />
        <RefusalAlert error={cancel.error} />
        <Button
          variant="link"
          className="h-auto min-h-11 px-0"
          disabled={!write.allowed || cancel.isPending}
          onClick={() => {
            cancel.mutate({ importId: page.id });
          }}
        >
          {t("cancelImport")}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("confirmTitle", { count })}
        description={t("confirmBody")}
        action={t("add", { count })}
        destructive={false}
        request={adding}
        returnFocusTo={addButton}
        onConfirm={() => {
          adding.mutate(rowNumbers);
        }}
      />
    </>
  );
}
