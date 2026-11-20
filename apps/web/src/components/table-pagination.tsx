"use client";

// A list's numbered pages (web revamp part 3; the owner liked AiGuru's): "Showing 21–40 of 349 leads", Rows per page,
// "Page 2 of 18", then first, previous, next and last as IconButtons, named in their tooltips, disabled at the ends
// and while a page loads. It sits under a table, and under a phone's list. Where the bar itself is wide enough (its
// own width, not the screen's, as the sidebar narrows it) it is one line, the counts at the left and the controls at the
// right; narrower, two tidy lines: what is shown and the page, then the size and the ways through. Every control keeps
// its 44px hit area, the buttons 12px apart so their hit areas never overlap.
import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { IconButton } from "@/components/icon-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCount } from "@/lib/format";

const numbers = (chunks: ReactNode) => <span className="numbers text-foreground">{chunks}</span>;

/** Where a page sits in a list: the page shown (a page past the last reads as the last), how many, and its rows. */
export function pageRange(page: number, size: number, total: number) {
  const pages = Math.max(1, Math.ceil(total / size));
  const shown = Math.min(page, pages);
  return { page: shown, pages, from: total === 0 ? 0 : (shown - 1) * size + 1, to: Math.min(shown * size, total) };
}

export function TablePagination({
  page,
  size,
  total,
  noun,
  sizes = [10, 20, 50, 100],
  busy = false,
  onPage,
  onSize,
}: {
  /** The page shown, from 1. */
  page: number;
  /** How many rows a page holds. */
  size: number;
  /** How many rows there are on every page. */
  total: number;
  /** What the rows are, counted for the total: "leads", "lead". */
  noun: string;
  sizes?: readonly number[];
  /** A page is loading: the ways through wait for it. */
  busy?: boolean;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}) {
  const t = useTranslations("common.pagination");
  const sizeLabel = useId();
  // A page past the last (a link kept from a longer list) reads as the last until the list moves there.
  const { page: shown, pages, from, to } = pageRange(page, size, total);
  const range = { from: formatCount(from), to: formatCount(to), total: formatCount(total) };
  const ways = [
    { name: t("first"), Icon: ChevronsLeftIcon, to: 1, open: shown > 1 },
    { name: t("previous"), Icon: ChevronLeftIcon, to: shown - 1, open: shown > 1 },
    { name: t("next"), Icon: ChevronRightIcon, to: shown + 1, open: shown < pages },
    { name: t("last"), Icon: ChevronsRightIcon, to: pages, open: shown < pages },
  ];
  return (
    <nav aria-label={t("label")} className="@container text-label text-muted-foreground">
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 @2xl:flex">
        <p className="@2xl:mr-auto">{t.rich("showing", { ...range, noun, n: numbers })}</p>
        <p className="justify-self-end @2xl:order-1">
          {t.rich("page", { page: formatCount(shown), pages: formatCount(pages), n: numbers })}
        </p>
        <div className="flex items-center gap-2">
          <span id={sizeLabel}>{t("rowsPerPage")}</span>
          <Select
            value={String(size)}
            onValueChange={(value) => {
              onSize(Number(value));
            }}
          >
            <SelectTrigger aria-labelledby={sizeLabel} className="numbers">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sizes.map((option) => (
                <SelectItem key={option} value={String(option)} className="numbers">
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 justify-self-end @2xl:order-2">
          {ways.map(({ name, Icon, to, open }) => (
            <IconButton
              key={name}
              variant="outline"
              aria-label={name}
              disabled={busy || !open}
              onClick={() => {
                onPage(to);
              }}
            >
              <Icon aria-hidden="true" />
            </IconButton>
          ))}
        </div>
      </div>
    </nav>
  );
}
