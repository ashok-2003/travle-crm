"use client";

// A form or confirmation over the page: a dialog on wider screens, a bottom sheet on phones (DESIGN.md: on mobile,
// prefer bottom sheets for forms and pickers). Both trap focus, close on Escape and give focus back afterwards, except
// while the request they sent is out: then nothing closes them, and they show no close button, so its answer lands
// where the person can see it.
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useWideScreen } from "@/lib/use-wide-screen";

export function ResponsiveDialog({
  open,
  onOpenChange,
  busy = false,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The dialog's request is out. */
  busy?: boolean;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const changeOpen = (next: boolean) => {
    if (next || !busy) onOpenChange(next);
  };
  if (useWideScreen()) {
    return (
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetContent
        side="bottom"
        showCloseButton={!busy}
        className="max-h-[90dvh] overflow-y-auto rounded-t-xl pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
