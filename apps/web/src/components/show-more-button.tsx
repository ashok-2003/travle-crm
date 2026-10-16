"use client";

// The way to a list's next page (data/use-cursor-pages.ts), under the list: only while there is one, and saying it is
// loading while it does, when it can't be pressed twice.
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function ShowMoreButton({
  pages,
  label,
}: {
  pages: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => Promise<unknown> };
  /** What it shows, such as "Show more organizations". */
  label: string;
}) {
  const t = useTranslations("common");
  if (!pages.hasNextPage) return null;
  return (
    <Button
      variant="outline"
      className="self-center"
      disabled={pages.isFetchingNextPage}
      onClick={() => void pages.fetchNextPage()}
    >
      {pages.isFetchingNextPage && <Spinner />}
      {pages.isFetchingNextPage ? t("loadingMore") : label}
    </Button>
  );
}
