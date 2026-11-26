"use client";

// A package row's "⋯" menu: Delete, which opens the list's confirmation. Only for a member who may edit packages.
import type { QuotePackage } from "@travel-crm/contracts/quotes";
import { EllipsisIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function PackageRowMenu({
  one,
  onDelete,
}: {
  one: QuotePackage;
  onDelete: (one: QuotePackage, returnFocusTo: RefObject<HTMLButtonElement | null>) => void;
}) {
  const t = useTranslations("packages.list");
  const menu = useRef<HTMLButtonElement>(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={menu} variant="ghost" size="icon" aria-label={t("moreFor", { name: one.name })}>
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            onDelete(one, menu);
          }}
        >
          {t("delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
