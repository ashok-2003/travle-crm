"use client";

// Whether an element, with some room around it, fits the screen's height, kept up to date as the element or the
// window changes size: for a column that stays in view while the page scrolls, which only works while it fits (a
// taller one would hide its end until the page's end).
import { useEffect, useState, type RefObject } from "react";

/** False until measured, so nothing sticks before it is known to fit. */
export function useFitsScreen(element: RefObject<HTMLElement | null>, room: number): boolean {
  const [fits, setFits] = useState(false);
  useEffect(() => {
    const node = element.current;
    if (node === null) return;
    const measure = () => {
      setFits(node.offsetHeight + room <= window.innerHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [element, room]);
  return fits;
}
