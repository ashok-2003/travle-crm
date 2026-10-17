// Giving the focus back to whatever opened a dialog that isn't its Radix trigger (a plain button, an item of a menu):
// Radix returns the focus only to a trigger of its own, so without this a closed dialog leaves the focus nowhere
// (DESIGN.md section 8: dialogs trap and restore focus). ResponsiveDialog, ConfirmDialog and FormDialog take the
// opener as `returnFocusTo`.
import type { RefObject } from "react";

/** The button that opened the dialog, or for an item of a menu the menu's own button: it takes the focus back. */
export type ReturnFocusTo = RefObject<HTMLElement | null>;

/** The dialog content's onCloseAutoFocus: the opener takes the focus, instead of the trigger Radix looks for. */
export function focusBackTo(opener: ReturnFocusTo | undefined): (event: Event) => void {
  return (event) => {
    if (opener === undefined) return;
    event.preventDefault();
    opener.current?.focus();
  };
}
