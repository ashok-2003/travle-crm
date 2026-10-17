"use client";

// A text once it has stopped changing for a moment, for asking the api only after a pause in typing: the lead
// search, the destination field, the search comboboxes (search-combobox.tsx), the known-contact check. Text only: a
// string compares by its content, so a value built afresh on every render can't restart the wait forever.
import { useEffect, useState } from "react";

/** How long typing pauses before the api is asked. */
export const TYPING_PAUSE_MS = 400;

export function useDebouncedValue(value: string, delayMs = TYPING_PAUSE_MS): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return settled;
}
