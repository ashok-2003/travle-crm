"use client";

// The console's phone navigation, as the app's bottom bar (DESIGN.md section 6): a 56px bar with four destinations
// and "More", labels always shown, above the home indicator. "More" opens a sheet with the rest, who is signed in,
// and sign-out.
import { EllipsisIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { BOTTOM_BAR_ITEMS } from "@/shell/navigation";
import { useStaff } from "../session/staff-context";
import { isCurrentConsoleItem, visibleConsoleItems } from "./console-navigation";
import { ConsoleSignOutButton } from "./console-sign-out";
import { SignedInStaff } from "./signed-in-staff";

const tabClasses = "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-caption font-medium";

export function ConsoleBottomBar() {
  const t = useTranslations("console");
  const staff = useStaff();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const items = visibleConsoleItems(staff);
  return (
    <nav
      aria-label={t("navigation.label")}
      className="fixed inset-x-0 bottom-0 z-10 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.slice(0, BOTTOM_BAR_ITEMS).map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={isCurrentConsoleItem(item, pathname) ? "page" : undefined}
          className={cn(tabClasses, isCurrentConsoleItem(item, pathname) ? "text-primary" : "text-muted-foreground")}
        >
          <item.icon aria-hidden="true" className="size-5" />
          {t(`navigation.${item.key}`)}
        </Link>
      ))}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger className={cn(tabClasses, "text-muted-foreground")}>
          <EllipsisIcon aria-hidden="true" className="size-5" />
          {t("navigation.more")}
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-xl pb-[env(safe-area-inset-bottom)]">
          <SheetHeader>
            <SheetTitle>{t("title")}</SheetTitle>
            <SheetDescription asChild>
              <div>
                <SignedInStaff />
              </div>
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4 pb-4">
            {items.slice(BOTTOM_BAR_ITEMS).map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isCurrentConsoleItem(item, pathname) ? "page" : undefined}
                onClick={() => {
                  setMoreOpen(false);
                }}
                className="flex h-11 items-center gap-3 rounded-lg px-3 font-medium hover:bg-accent"
              >
                <item.icon aria-hidden="true" className="size-5" />
                {t(`navigation.${item.key}`)}
              </Link>
            ))}
            <ConsoleSignOutButton className="justify-start px-3" />
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
