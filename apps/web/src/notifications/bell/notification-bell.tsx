"use client";

// The bell (spec 9.4): a button with the unread count, opening the person's notifications in a popover from the
// sidebar on wide screens, or in a sheet from the bottom on phones (DESIGN.md: sheets on mobile). Its label says the
// count, so a screen reader hears it without the badge.
import { BellIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { MarkAllRead } from "./mark-all-read";
import { NotificationList } from "./notification-list";
import { UnreadCount } from "./unread-count";
import { useUnreadCount } from "./use-bell";

export function NotificationBell({ opensAs }: { opensAs: "popover" | "sheet" }) {
  const t = useTranslations("notifications.bell");
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount().data ?? 0;
  const close = () => {
    setOpen(false);
  };
  const trigger = (
    <Button variant="ghost" size="icon" aria-label={t("label", { count: unread })} className="relative shrink-0">
      <BellIcon aria-hidden="true" />
      {unread > 0 && <UnreadCount count={unread} />}
    </Button>
  );

  if (opensAs === "popover") {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="start"
          aria-labelledby={titleId}
          className="max-h-[80dvh] w-96 max-w-[calc(100vw-2rem)] gap-0 overflow-y-auto p-0"
        >
          <PopoverHeader className="px-4 pt-3">
            <div className="flex items-center justify-between gap-2">
              <PopoverTitle id={titleId} className="text-section font-semibold">
                {t("title")}
              </PopoverTitle>
              <MarkAllRead />
            </div>
            <PopoverDescription>{t("description")}</PopoverDescription>
          </PopoverHeader>
          <NotificationList open={open} onFollow={close} />
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] gap-0 overflow-y-auto rounded-t-xl pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader>
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>{t("title")}</SheetTitle>
            <MarkAllRead />
          </div>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>
        <NotificationList open={open} onFollow={close} />
      </SheetContent>
    </Sheet>
  );
}
