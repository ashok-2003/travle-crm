"use client";

// The console's desktop navigation, as the app's sidebar (DESIGN.md section 6): a 232px column on the surface tone,
// the console's name, the destinations for the person's level, and who is signed in with sign-out at the bottom.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useStaff } from "../session/staff-context";
import { isCurrentConsoleItem, visibleConsoleItems } from "./console-navigation";
import { ConsoleSignOutButton } from "./console-sign-out";
import { SignedInStaff } from "./signed-in-staff";

export function ConsoleSidebar() {
  const t = useTranslations("console");
  const staff = useStaff();
  const pathname = usePathname();
  return (
    <aside className="hidden w-58 shrink-0 flex-col gap-6 border-r bg-surface px-3 py-5 md:flex">
      <p className="px-3 text-section font-semibold">{t("title")}</p>
      <nav aria-label={t("navigation.label")} className="flex flex-1 flex-col gap-1">
        {visibleConsoleItems(staff).map((item) => {
          const current = isCurrentConsoleItem(item, pathname);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-lg px-3 font-medium text-foreground hover:bg-accent",
                current && "bg-accent text-accent-foreground",
              )}
            >
              <item.icon aria-hidden="true" className="size-5" />
              {t(`navigation.${item.key}`)}
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col gap-1 border-t pt-4">
        <div className="px-3 py-1">
          <SignedInStaff />
        </div>
        <ConsoleSignOutButton className="justify-start px-3" />
      </div>
    </aside>
  );
}
