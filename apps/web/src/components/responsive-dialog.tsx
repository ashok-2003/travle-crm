"use client";

// A form or confirmation over the page: a dialog on wider screens, a bottom sheet on phones (DESIGN.md: on mobile,
// prefer bottom sheets for forms and pickers). Both trap focus, close on Escape and give focus back afterwards.
//
// How to use it:
// - `children` is the body, and only the body scrolls, so the title and the footer always stay on screen.
// - `footer` holds the dialog's actions, its primary last. It renders in the registry's DialogFooter or SheetFooter:
//   stacked full width with the primary on top on phones, in a row at the right on desktop. Cancel comes first on its
//   own (`common.cancel`; it closes the dialog). Pass `cancel={false}` for a footer that ends the dialog itself, such
//   as Done after a handover.
// - A form in the body submits from the footer through the `form` attribute: `<form id={formId}>` in the body and
//   `<Button type="submit" form={formId}>` in the footer (`useId()` gives the id).
// - `busy`: the dialog's request is out. Nothing closes it then (Escape, the overlay, Cancel), and it shows no close
//   button, so the answer lands where the person can see it (the fix wave's rule 7). Disable the primary yourself.
// - `returnFocusTo`: the button that opened it (a ref), which takes the focus back when it closes. Every dialog here is
//   opened by a plain button or a menu's item, never by a Radix trigger, so without it the focus goes nowhere.
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useWideScreen } from "@/lib/use-wide-screen";
import { cn } from "@/lib/utils";
import { focusBackTo, type ReturnFocusTo } from "./return-focus";

/** A bottom sheet's frame on phones: at most 90% of the screen, scrolling past it, clear of the home indicator. */
export const BOTTOM_SHEET_CLASSES = "max-h-[90dvh] overflow-y-auto rounded-t-xl pb-[env(safe-area-inset-bottom)]";

export function ResponsiveDialog({
  open,
  onOpenChange,
  busy = false,
  title,
  description,
  footer,
  cancel = true,
  returnFocusTo,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The dialog's request is out. */
  busy?: boolean;
  title: string;
  description: string;
  /** The actions, the primary last, which stay on screen while the body scrolls. */
  footer?: ReactNode;
  /** Whether the footer starts with Cancel. */
  cancel?: boolean;
  /** The button that opened it, which takes the focus back when it closes. */
  returnFocusTo?: ReturnFocusTo | undefined;
  children: ReactNode;
}) {
  const t = useTranslations("common");
  const wide = useWideScreen();
  const changeOpen = (next: boolean) => {
    if (next || !busy) onOpenChange(next);
  };
  const actions = footer !== undefined && (
    <>
      {cancel && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            changeOpen(false);
          }}
        >
          {t("cancel")}
        </Button>
      )}
      {footer}
    </>
  );

  // The scrolling body runs edge to edge with its own padding, above and below too, so its fields' focus outlines
  // aren't clipped.
  if (wide) {
    return (
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent
          className="max-h-[calc(100dvh-4rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg"
          showCloseButton={!busy}
          onCloseAutoFocus={focusBackTo(returnFocusTo)}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="-mx-4 -my-1 overflow-y-auto px-4 py-1">{children}</div>
          {actions && <DialogFooter>{actions}</DialogFooter>}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetContent
        side="bottom"
        showCloseButton={!busy}
        className={cn(BOTTOM_SHEET_CLASSES, "gap-0")}
        onCloseAutoFocus={focusBackTo(returnFocusTo)}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-1", !actions && "pb-4")}>{children}</div>
        {actions && <SheetFooter className="flex-col-reverse">{actions}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}
