"use client";

// Whether the screen is tablet-wide or more (768px, DESIGN.md's breakpoint), for parts that differ in kind between a
// phone and a wider screen: a sheet or a dialog, a list or a table.
import { useMediaQuery } from "./use-media-query";

/** Phones first: false until the browser says otherwise, and while the page renders on the server. */
export function useWideScreen(): boolean {
  return useMediaQuery("(min-width: 768px)");
}
