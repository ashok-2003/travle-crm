"use client";

// One broadcast (sales inbox spec 6): its counts, why it paused if it did, Cancel and Resume for whoever writes the agency's
// templates, and every chat it was made for with where each stands. Looked at again every 15 seconds while open.
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Details } from "@/components/details";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { ShowMoreButton } from "@/components/show-more-button";
import { BackLink } from "@/components/text-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/format";
import { routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { BroadcastRecipients } from "./broadcast-recipients";
import { BroadcastStatus } from "./broadcast-status";
import { useBroadcastControls, useBroadcastDetail } from "./use-broadcasts";

export function BroadcastDetailScreen({ broadcastId }: { broadcastId: string }) {
  const t = useTranslations("inbox.broadcasts");
  const { timeZone } = useMe().organization;
  const access = useWriteAccess("change");
  const detail = useBroadcastDetail(broadcastId);
  const [cancelling, setCancelling] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const controls = useBroadcastControls(() => {
    setCancelling(false);
  });
  const back = <BackLink href={routes.broadcasts} label={t("back")} />;
  const { broadcast } = detail;
  if (broadcast === undefined) {
    return (
      <div className="flex max-w-[1100px] flex-col gap-6">
        {back}
        {detail.isError ? (
          <ErrorState
            message={t("loadFailed")}
            error={detail.error}
            retryLabel={t("retry")}
            onRetry={() => void detail.refetch()}
          />
        ) : (
          <LoadingRows shape="twoLines" label={t("loading")} />
        )}
      </div>
    );
  }
  const open = broadcast.status === "sending" || broadcast.status === "paused";
  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      {back}
      <PageHeader
        title={broadcast.templateName}
        intro={<BroadcastStatus status={broadcast.status} />}
        action={
          open && (
            <div className="flex flex-wrap gap-2">
              {broadcast.status === "paused" && (
                <Button
                  disabled={!access.allowed || controls.resume.isPending}
                  onClick={() => {
                    controls.resume.mutate({ broadcastId });
                  }}
                >
                  {t("resume")}
                </Button>
              )}
              <Button
                ref={cancelButton}
                variant="destructive"
                disabled={!access.allowed}
                onClick={() => {
                  setCancelling(true);
                }}
              >
                {t("cancel")}
              </Button>
            </div>
          )
        }
      />
      {broadcast.pausedReason !== null && (
        <Alert>
          <AlertDescription>{t(`pausedReason.${broadcast.pausedReason}`)}</AlertDescription>
        </Alert>
      )}
      <RefusalAlert error={controls.resume.error} />
      <Details
        rows={[
          { label: t("detail.message"), value: broadcast.message },
          { label: t("detail.tags"), value: broadcast.tagNames.join(", ") },
          {
            label: t("detail.startedBy"),
            value: `${detail.people[broadcast.createdBy] ?? ""} · ${formatDay(new Date(broadcast.createdAt), { timeZone })}`,
          },
          { label: t("detail.sent"), value: `${String(broadcast.counts.sent)} / ${String(broadcast.counts.total)}` },
          { label: t("detail.waiting"), value: String(broadcast.counts.waiting) },
          { label: t("detail.skipped"), value: String(broadcast.counts.skipped) },
          { label: t("detail.failed"), value: String(broadcast.counts.failed) },
          { label: t("detail.refused"), value: String(broadcast.counts.refused), info: t("detail.refusedInfo") },
        ]}
      />
      <section aria-labelledby="recipients-heading" className="flex flex-col gap-3">
        <h2 id="recipients-heading" className="text-section font-semibold">
          {t("detail.recipients")}
        </h2>
        <BroadcastRecipients recipients={detail.items ?? []} />
        <ShowMoreButton pages={detail} label={t("detail.showMore")} />
      </section>
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={t("cancelTitle")}
        description={t("cancelDescription")}
        action={t("cancelConfirm")}
        request={controls.cancel}
        onConfirm={() => {
          controls.cancel.mutate({ broadcastId });
        }}
        returnFocusTo={cancelButton}
      />
    </div>
  );
}
