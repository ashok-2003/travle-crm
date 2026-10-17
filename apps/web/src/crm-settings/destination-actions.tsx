"use client";

// The actions on one destination: rename it, or merge it into another. Both are changes, so while the subscription
// refuses changes they are off and the menu says why (ADR 0021).
import type { Destination } from "@travel-crm/contracts/catalog";
import { EllipsisVerticalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWriteAccess } from "@/subscription/write-access";
import { MergeDestinationsDialog } from "./merge-destinations-dialog";
import { RenameDestinationDialog } from "./rename-destination-dialog";

type OpenDialog = "rename" | "merge" | null;

export function DestinationActions({ destination }: { destination: Destination }) {
  const t = useTranslations("settings.destinations");
  const [open, setOpen] = useState<OpenDialog>(null);
  // The dialogs aren't the menu's: closed, they give the focus back to its button.
  const menu = useRef<HTMLButtonElement>(null);
  const write = useWriteAccess();
  const closeWhen = (dialog: Exclude<OpenDialog, null>) => (next: boolean) => {
    setOpen(next ? dialog : null);
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={menu} variant="ghost" size="icon" aria-label={t("actionsFor", { name: destination.name })}>
            <EllipsisVerticalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={write.hint === null ? undefined : "w-72"}>
          {write.hint !== null && (
            <DropdownMenuLabel className="text-caption font-normal">{write.hint}</DropdownMenuLabel>
          )}
          <DropdownMenuItem
            disabled={!write.allowed}
            onSelect={() => {
              setOpen("rename");
            }}
          >
            {t("rename.action")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!write.allowed}
            onSelect={() => {
              setOpen("merge");
            }}
          >
            {t("merge.action")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {open === "rename" && (
        <RenameDestinationDialog
          destination={destination}
          open
          onOpenChange={closeWhen("rename")}
          returnFocusTo={menu}
        />
      )}
      {open === "merge" && (
        <MergeDestinationsDialog
          destination={destination}
          open
          onOpenChange={closeWhen("merge")}
          returnFocusTo={menu}
        />
      )}
    </>
  );
}
