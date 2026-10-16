"use client";

// One export of the organization: its state as a dot and a word, when it was asked for, finished and is kept until,
// what it holds once done, and, for a done one, its download links, each working for about 15 minutes (a download is
// logged, so the links are fetched only when asked for). Once the links lapse they are dropped, and Download is back.
import type { OrganizationExport } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { RefusalAlert } from "@/components/refusal-alert";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Item, ItemContent } from "@/components/ui/item";
import { useInstantText } from "@/components/instant-text";
import { useDownloadExport } from "./use-exports";

const toneOf: Record<OrganizationExport["state"], StatusTone> = {
  requested: "attention",
  done: "good",
  failed: "bad",
  expired: "neutral",
};

const COUNTS = ["parts", "rows", "people", "files"] as const;

export function ExportItem({ entry }: { entry: OrganizationExport }) {
  const t = useTranslations("consolePlatform.dataProtection.exports");
  const instantText = useInstantText();
  const download = useDownloadExport();
  /** The figures of a sentence in mono, the words around them not. */
  const figures = (chunks: ReactNode) => <span className="numbers">{chunks}</span>;
  const { reset } = download;
  const linksExpireAt = download.data?.linksExpireAt;
  useEffect(() => {
    if (linksExpireAt === undefined) return;
    const timer = setTimeout(reset, Math.max(0, Date.parse(linksExpireAt) - Date.now()));
    return () => {
      clearTimeout(timer);
    };
  }, [linksExpireAt, reset]);
  return (
    <Item size="sm" role="listitem">
      <ItemContent className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <StatusBadge tone={toneOf[entry.state]}>{t(`states.${entry.state}`)}</StatusBadge>
          <span className="flex flex-wrap gap-x-3 text-caption text-muted-foreground">
            <span>{t.rich("requestedAt", { when: instantText(entry.requestedAt), v: figures })}</span>
            {entry.completedAt !== null && (
              <span>{t.rich("completedAt", { when: instantText(entry.completedAt), v: figures })}</span>
            )}
            <span>{t.rich("expiresAt", { when: instantText(entry.expiresAt), v: figures })}</span>
          </span>
        </div>
        {entry.state === "done" && (
          <span className="flex flex-wrap gap-x-4 text-label">
            {COUNTS.map((count) => {
              const value = entry[count];
              return value === null ? null : (
                <span key={count} className="numbers">
                  {t(count, { count: value })}
                </span>
              );
            })}
          </span>
        )}
        {entry.state === "done" && !download.data && (
          <Button
            variant="outline"
            className="self-start"
            aria-label={t("downloadFor", { when: instantText(entry.requestedAt) })}
            disabled={download.isPending}
            onClick={() => {
              download.mutate({ exportId: entry.exportId });
            }}
          >
            {download.isPending ? t("downloading") : t("download")}
          </Button>
        )}
        <RefusalAlert error={download.error} />
        {download.data && (
          <div className="flex flex-col gap-1">
            <p className="text-caption text-muted-foreground">
              {t("linksExpire", { when: instantText(download.data.linksExpireAt) })}
            </p>
            <ul className="flex flex-col">
              {download.data.parts.map((part) => (
                <li key={part.part}>
                  <TextLink href={part.url}>{t("part", { number: part.part })}</TextLink>
                </li>
              ))}
              {download.data.files.map((file) => (
                <li key={file.fileId}>
                  <TextLink href={file.url}>
                    <span className="numbers break-all">{t("file", { id: file.fileId })}</span>
                  </TextLink>
                </li>
              ))}
            </ul>
          </div>
        )}
      </ItemContent>
    </Item>
  );
}
