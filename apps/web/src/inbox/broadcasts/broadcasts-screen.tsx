"use client";

// Inbox, Broadcasts (sales inbox spec 6; the Owner and Admins): every broadcast with its live counts, newest first, and the
// button that starts one. Counts and the month's allowance only: the agency never sees what Meta charges.
import { MegaphoneIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { formatDay } from "@/lib/format";
import { broadcastRoute, routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { BroadcastStatus } from "./broadcast-status";
import { NewBroadcastDialog } from "./new-broadcast-dialog";
import { useBroadcastList } from "./use-broadcasts";

export function BroadcastsScreen() {
  const t = useTranslations("inbox.broadcasts");
  const inbox = useTranslations("inbox");
  const hintId = useId();
  const { timeZone } = useMe().organization;
  const list = useBroadcastList();
  const access = useWriteAccess("change");
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const body = () => {
    if (list.data === undefined) {
      return list.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={list.error}
          retryLabel={t("retry")}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <LoadingRows shape="twoLines" label={t("loading")} />
      );
    }
    if (list.data.items.length === 0) return <EmptyState icon={MegaphoneIcon} message={t("empty")} />;
    return (
      <ItemGroup aria-label={t("list")} role="list">
        {list.data.items.map((item) => (
          <Item key={item.id} asChild variant="muted" role="listitem">
            <Link href={broadcastRoute(item.id)}>
              <ItemContent className="min-w-0">
                <ItemTitle className="wrap-anywhere">
                  {item.templateName} · {item.tagNames.join(", ")}
                </ItemTitle>
                <ItemDescription className="line-clamp-none">
                  {t("sentOf", { sent: item.counts.sent, total: item.counts.total })} ·{" "}
                  {t("counts", {
                    waiting: item.counts.waiting,
                    skipped: item.counts.skipped,
                    failed: item.counts.failed,
                  })}
                </ItemDescription>
                <ItemDescription className="line-clamp-none">
                  {t("startedBy", {
                    name: list.data.people[item.createdBy] ?? "",
                    when: formatDay(new Date(item.createdAt), { timeZone }),
                  })}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <BroadcastStatus status={item.status} />
              </ItemActions>
            </Link>
          </Item>
        ))}
      </ItemGroup>
    );
  };
  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      <BackLink href={routes.inbox} label={inbox("back")} />
      <PageHeader
        title={t("title")}
        intro={t("intro")}
        action={
          <div className="flex flex-col gap-2">
            <Button
              ref={button}
              disabled={!access.allowed}
              aria-describedby={access.hint === null ? undefined : hintId}
              onClick={() => {
                setOpen(true);
              }}
            >
              {t("new")}
            </Button>
            <WriteHint id={hintId} hint={access.hint} visible />
          </div>
        }
      />
      {body()}
      <NewBroadcastDialog open={open} onOpenChange={setOpen} returnFocusTo={button} />
    </div>
  );
}
