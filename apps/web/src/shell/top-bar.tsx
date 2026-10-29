"use client";

// The phone's bar above the page: the agency's logo (or name) and the bell, so the bottom bar keeps its destinations
// (DESIGN.md: 4-5, More included). Wide screens have both in the sidebar instead.
import { Separator } from "@/components/ui/separator";
import { NotificationBell } from "@/notifications/bell/notification-bell";
import { OrgMark } from "./org-mark";

export function TopBar() {
  return (
    <div className="md:hidden">
      <header className="flex min-h-14 items-center justify-between gap-2 py-1 pr-2 pl-4">
        <OrgMark className="min-w-0" />
        <NotificationBell opensAs="sheet" />
      </header>
      <Separator />
    </div>
  );
}
