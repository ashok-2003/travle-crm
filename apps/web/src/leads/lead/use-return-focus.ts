"use client";

// Giving the focus back to the button that opened a dialog it isn't the Radix trigger of (a card's Edit, an item of
// the ⋯ menu): Radix returns it only to its own trigger, so without this a closed dialog leaves the focus nowhere
// (DESIGN.md section 8: dialogs trap and restore focus). Call returnFocus whenever the dialog closes, saved or
// cancelled; it waits a frame, until the dialog has let go of the focus.
import { useCallback, useRef } from "react";

export function useReturnFocus() {
  const ref = useRef<HTMLButtonElement>(null);
  const returnFocus = useCallback(() => {
    requestAnimationFrame(() => {
      ref.current?.focus();
    });
  }, []);
  return { ref, returnFocus };
}
