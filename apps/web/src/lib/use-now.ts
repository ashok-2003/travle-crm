"use client";

// The current time, kept fresh every minute by default, for words that age as the screen stays open ("12 min ago",
// a follow-up turning overdue).
import { useEffect, useState } from "react";

export function useNow(everyMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, everyMs);
    return () => {
      clearInterval(timer);
    };
  }, [everyMs]);
  return now;
}
