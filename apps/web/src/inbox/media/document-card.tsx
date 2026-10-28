"use client";

// A document in a bubble (audit 3): an icon by its type, its name and size, and two separate actions, Open (in a tab, for a
// file the browser can show, such as a PDF) and Download (saves it under its name). The page count is not known to us, so it
// is not shown.
import type { MediaLink } from "@travel-crm/contracts/inbox";
import { DownloadIcon, ExternalLinkIcon, FileIcon, FileSpreadsheetIcon, FileTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { formatFileSize } from "@/files/file-size";
import { useMessageDownload } from "./use-message-download";

function FileTypeIcon({ contentType }: { contentType: string }) {
  if (contentType === "application/pdf" || contentType.startsWith("text/")) return <FileTextIcon aria-hidden="true" />;
  if (contentType.includes("spreadsheet")) return <FileSpreadsheetIcon aria-hidden="true" />;
  return <FileIcon aria-hidden="true" />;
}

/** The type as people say it. */
function kindWords(contentType: string): "pdf" | "word" | "sheet" | "slides" | "text" | "file" {
  if (contentType === "application/pdf") return "pdf";
  if (contentType.includes("wordprocessing")) return "word";
  if (contentType.includes("spreadsheet")) return "sheet";
  if (contentType.includes("presentation")) return "slides";
  return contentType.startsWith("text/") ? "text" : "file";
}

export function DocumentCard({ messageId, link }: { messageId: string; link: MediaLink }) {
  const t = useTranslations("inbox.chat.documentCard");
  const download = useMessageDownload();
  const name = link.fileName ?? t("unnamed");
  // A file the api opens in place is one the browser can show; the others only save.
  const opensInPlace = link.contentType === "application/pdf";
  return (
    <Item variant="muted" size="sm" className="min-w-64 flex-nowrap">
      <ItemMedia variant="icon">
        <FileTypeIcon contentType={link.contentType} />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="truncate" dir="auto">
          {name}
        </ItemTitle>
        <ItemDescription>
          {t(`kinds.${kindWords(link.contentType)}`)} · {formatFileSize(link.sizeBytes)}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {opensInPlace && (
          <Button asChild variant="ghost" size="icon" aria-label={t("open", { name })}>
            <a href={link.url} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon aria-hidden="true" />
            </a>
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("download", { name })}
          disabled={download.isPending}
          onClick={() => {
            download.mutate(messageId);
          }}
        >
          <DownloadIcon aria-hidden="true" />
        </Button>
      </ItemActions>
    </Item>
  );
}
