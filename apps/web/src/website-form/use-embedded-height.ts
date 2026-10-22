"use client";

// The embed tells the page around it how tall it is, whenever that changes, so embed.js can size the iframe (W31). The
// message holds a number and nothing else; the target is any origin because the form cannot know the agency's site.
import { useEffect, type RefObject } from "react";

export function useEmbeddedHeight(element: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const target = element.current;
    if (!enabled || target === null) return;
    const report = () => {
      window.parent.postMessage(
        { type: "travel-crm-form:height", height: Math.ceil(target.getBoundingClientRect().height) },
        "*",
      );
    };
    const observer = new ResizeObserver(report);
    observer.observe(target);
    report();
    return () => {
      observer.disconnect();
    };
  }, [element, enabled]);
}
