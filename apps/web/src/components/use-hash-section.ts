"use client";

// A screen whose content loads after it opens takes the reader to the part its address names
// (/settings/profile#bank-details) once that part is on the page: scrolled to the top of the window and focused, as the
// browser does by itself for content that is there on arrival. The part has the id, and tabIndex={-1} to take focus.
import { useEffect } from "react";

/** Called by the component that renders the parts, so it runs once they are on the page. */
export function useHashSection(): void {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    const section = id === "" ? null : document.getElementById(id);
    if (!section) return;
    section.scrollIntoView({ block: "start" });
    section.focus({ preventScroll: true });
  }, []);
}
