"use client";

// A screen that swaps in place (a step, a "reading" wait) leaves the focus on a button that is gone. This moves it to the
// new heading, which a screen reader then reads and a keyboard starts from: when the step's key changes, and when the
// heading itself is a new one, as when a wait inside the step gives way to the step's own screen.
import { useEffect, useRef, type ReactNode } from "react";

export function FocusedStep({ stepKey, children }: { stepKey?: string; children: ReactNode }) {
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = wrapper.current;
    if (element === null) return;
    let focused: Element | null = null;
    const focusHeading = () => {
      const heading = element.querySelector("h1");
      if (heading === null || heading === focused) return;
      focused = heading;
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    };
    focusHeading();
    const watching = new MutationObserver(focusHeading);
    watching.observe(element, { childList: true, subtree: true });
    return () => {
      watching.disconnect();
    };
  }, [stepKey]);
  return <div ref={wrapper}>{children}</div>;
}
