"use client";

// Shows its children only after a short wait (DESIGN.md: skeletons after 200ms), so a quick load never flashes one.
import { useEffect, useState, type ReactNode } from "react";

export function Delayed({ children, after = 200 }: { children: ReactNode; after?: number }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setShown(true);
    }, after);
    return () => {
      clearTimeout(timer);
    };
  }, [after]);
  return shown ? children : null;
}
