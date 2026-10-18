"use client";

// An element's height in px, kept up to date as it changes size (a timeline that a new note makes taller): for a
// column that sticks with room to spare, or far enough up to show its end. Null until it is measured.
import { useEffect, useState, type RefObject } from "react";

export function useElementHeight(element: RefObject<HTMLElement | null>): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const node = element.current;
    if (node === null) return;
    const measure = () => {
      setHeight(node.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [element]);
  return height;
}
