"use client";

// What a Page that has stopped, or soon will, says: what happened, since when, and the one thing to do. Facebook stopped
// sharing it or the token ends soon (Reconnect), a form's questions changed (look at the forms), a pause (Resume) and a
// read-only subscription. Meta being busy shows nothing: the next check simply goes on.
import { useMutation } from "@tanstack/react-query";
import type { MetaPageDetail } from "@travel-crm/contracts/meta-leads";
import { useTranslations } from "next-intl";
import { RefusalAlert } from "@/components/refusal-alert";
import { useTRPC } from "@/data/trpc";
import { focusPageHeading } from "@/lib/focus-page-heading";
import { formatDay } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { AlertAction, AlertFrame } from "../../attention-parts";
import { useRefreshMeta } from "../use-meta-pages";
import { useReconnect } from "./use-reconnect";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function AttentionAlert({ detail, now = new Date() }: { detail: MetaPageDetail; now?: Date }) {
  const t = useTranslations("metaLeads.page.attention");
  const trpc = useTRPC();
  const refresh = useRefreshMeta();
  const { timeZone } = useMe().organization;
  const reconnect = useReconnect();
  const resume = useMutation(
    trpc.metaLeads.resume.mutationOptions({
      onSuccess: async () => {
        await refresh();
        focusPageHeading();
      },
    }),
  );
  const day = (at: string) => formatDay(new Date(at), { timeZone, now });
  const since = detail.attentionSince === null ? null : t("since", { when: day(detail.attentionSince) });
  const expiresSoon =
    detail.tokenExpiresAt !== null && new Date(detail.tokenExpiresAt).getTime() - now.getTime() < WEEK_MS;

  const reconnectButton = (
    <AlertAction
      kind="change"
      label={t("reconnect")}
      pending={reconnect.isPending || reconnect.isSuccess}
      onClick={() => {
        reconnect.mutate({ pageId: detail.id });
      }}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      {detail.readOnly && (
        <AlertFrame tone="info" title={t("readOnly.title")}>
          <p>{t("readOnly.body")}</p>
        </AlertFrame>
      )}
      {detail.status === "needs_reconnect" && (
        <>
          <AlertFrame tone="problem" title={t("needs_reconnect.title")}>
            <p>{t("needs_reconnect.body")}</p>
            {since !== null && <p>{since}</p>}
            {reconnectButton}
          </AlertFrame>
          <RefusalAlert error={reconnect.error} />
        </>
      )}
      {detail.status === "running" && expiresSoon && detail.tokenExpiresAt !== null && (
        <>
          <AlertFrame tone="info" title={t("expiring.title", { day: day(detail.tokenExpiresAt) })}>
            <p>{t("expiring.body")}</p>
            {reconnectButton}
          </AlertFrame>
          <RefusalAlert error={reconnect.error} />
        </>
      )}
      {detail.status === "paused" && (
        <>
          <AlertFrame tone="info" title={t("paused.title")}>
            <p>{t("paused.body")}</p>
            <AlertAction
              kind="change"
              label={t("resume")}
              pending={resume.isPending}
              onClick={() => {
                resume.mutate({ pageId: detail.id });
              }}
            />
          </AlertFrame>
          <RefusalAlert error={resume.error} />
        </>
      )}
      {detail.status === "running" && detail.badge === "needs_attention" && (
        <AlertFrame tone="info" title={t("forms.title")}>
          <p>{t("forms.body")}</p>
        </AlertFrame>
      )}
    </div>
  );
}
