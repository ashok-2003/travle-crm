"use client";

// Gives a screen that must not scroll as a page (the inbox, like a chat app) exactly the height left on screen: from
// where it starts (under the phone's top bar and any banner) down to the screen's foot, less the phone's bottom bar when
// it shows. Measured, not guessed, so a banner or a bar of a new height never pushes the reply box below the screen.
import { useLayoutEffect, useRef, useState } from "react";

export function useFillScreen<Element extends HTMLElement>() {
  const ref = useRef<Element>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const element = ref.current;
      if (element === null) return;
      const nav = document.querySelector<HTMLElement>("[data-phone-navigation]");
      const navHeight = nav?.checkVisibility() === true ? nav.getBoundingClientRect().height : 0;
      const top = element.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(320, window.innerHeight - top - navHeight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return { ref, style: height === null ? undefined : { height: `${String(height)}px` } };
}
