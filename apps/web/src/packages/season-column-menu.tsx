"use client";

// A price-table column's menu: Change dates (a column of one range), No end date (a column of several whose last range
// is the trip's last season and has an end), Rename and Remove. Off while the table has price changes not yet saved,
// since a season change reads the trip again and would drop them.
import { EllipsisIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ColumnAction = "dates" | "rename" | "remove" | "noEnd";

export function SeasonColumnMenu({
  season,
  actions,
  disabled,
  describedBy,
  onOpen,
  onChoose,
}: {
  season: string;
  /** Which of the column's actions apply. */
  actions: readonly ColumnAction[];
  disabled: boolean;
  describedBy: string | undefined;
  onOpen: (button: HTMLElement) => void;
  onChoose: (action: ColumnAction) => void;
}) {
  const t = useTranslations("packages.prices");
  const words: Record<ColumnAction, string> = {
    dates: t("changeDates"),
    noEnd: t("noEnd"),
    rename: t("rename"),
    remove: t("remove"),
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-describedby={describedBy}
          aria-label={t("seasonMenu", { season })}
          onClick={(event) => {
            onOpen(event.currentTarget);
          }}
        >
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action}
            variant={action === "remove" ? "destructive" : "default"}
            onSelect={() => {
              onChoose(action);
            }}
          >
            {words[action]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
