"use client";

// The phone's navigation, the app's and the console's (DESIGN.md section 6): a 56px bar at the bottom with up to four
// destinations and "More", labels always shown, above the home indicator. "More" opens a sheet with whose it is and
// who is signed in, the rest of the destinations as the sidebar lists them, and sign-out. Wide screens have the
// sidebar instead.
import { EllipsisIcon, LogOutIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { BOTTOM_SHEET_CLASSES } from "@/components/responsive-dialog";
import { cn } from "@/lib/utils";
import { prefetchHandlers } from "./prefetch";

/** How many destinations fit in the bar before the rest move to "More" (DESIGN.md: 4-5, More included). */
const IN_BAR = 4;

export interface PhoneDestination {
  key: string;
  href: string;
  icon: LucideIcon;
  label: string;
  current: boolean;
  /** Loads the destination's data when its link is touched or focused (shell/prefetch.ts). */
  prefetch?: () => void;
}

const tabClasses = "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-caption font-medium";

function linkProps({ href, current, prefetch }: PhoneDestination) {
  return { href, "aria-current": current ? ("page" as const) : undefined, ...(prefetch && prefetchHandlers(prefetch)) };
}

export function PhoneNavigation({
  label,
  moreLabel,
  destinations,
  moreOnly = [],
  title,
  description,
  signOut,
}: {
  /** The navigation's name, the sidebar's too. */
  label: string;
  moreLabel: string;
  /** In order: the first four in the bar, the rest in More. */
  destinations: PhoneDestination[];
  /** In More alone, after the rest: the person's account. */
  moreOnly?: PhoneDestination[];
  /** Atop More: whose app it is, and who is signed in. */
  title: string;
  description: ReactNode;
  signOut: { label: string; onClick: () => void };
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <nav
      aria-label={label}
      data-phone-navigation
      className="fixed inset-x-0 bottom-0 z-(--z-sticky) bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <Separator />
      <div className="flex">
        {destinations.slice(0, IN_BAR).map((destination) => (
          <Link
            key={destination.key}
            {...linkProps(destination)}
            className={cn(tabClasses, destination.current ? "text-primary" : "text-muted-foreground")}
          >
            <destination.icon aria-hidden="true" className="size-5" />
            {destination.label}
          </Link>
        ))}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger className={cn(tabClasses, "text-muted-foreground")}>
            <EllipsisIcon aria-hidden="true" className="size-5" />
            {moreLabel}
          </SheetTrigger>
          <SheetContent side="bottom" className={BOTTOM_SHEET_CLASSES}>
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription asChild>
                <div>{description}</div>
              </SheetDescription>
            </SheetHeader>
            <SidebarMenu className="px-4 pb-4">
              {[...destinations.slice(IN_BAR), ...moreOnly].map((destination) => (
                <SidebarMenuItem key={destination.key}>
                  <SidebarMenuButton asChild isActive={destination.current}>
                    <Link
                      {...linkProps(destination)}
                      onClick={() => {
                        setMoreOpen(false);
                      }}
                    >
                      <destination.icon aria-hidden="true" />
                      {destination.label}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton onClick={signOut.onClick}>
                  <LogOutIcon aria-hidden="true" />
                  {signOut.label}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
