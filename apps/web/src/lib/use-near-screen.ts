"use client";

// Whether an element has come near the screen (within a screen's height of it), for work worth doing only when it may
// be seen: the public page's prices. Once near, it stays so. Without IntersectionObserver, it counts as near at once.
import { useCallback, useState } from "react";

export function useNearScreen(): [boolean, (element: HTMLElement | null) => void] {
  const [near, setNear] = useState(false);
  const ref = useCallback((element: HTMLElement | null) => {
    if (element === null) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(element);
  }, []);
  return [near, ref];
}
