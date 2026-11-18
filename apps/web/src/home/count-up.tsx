"use client";

// A figure that counts up from 0 to its value (Cult UI's rolling number). Its spring starts at the first value it
// gets, so it is given 0 and then the real one. Under prefers-reduced-motion it is just the value. Screen readers get
// the real value at once, never the count.
import { useEffect, useState } from "react";
import { RollingNumber } from "@/components/ui/rolling-number";
import { formatCount } from "@/lib/format";
import { useMediaQuery } from "@/lib/use-media-query";

export function CountUp({ value }: { value: number }) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [shown, setShown] = useState(0);
  useEffect(() => {
    // After the first paint, so the spring has started at 0 and then has somewhere to go.
    const frame = requestAnimationFrame(() => {
      setShown(value);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [value]);
  if (reduced) return <>{formatCount(value)}</>;
  return (
    <>
      <span aria-hidden="true">
        <RollingNumber value={shown} format={formatCount} />
      </span>
      <span className="sr-only">{formatCount(value)}</span>
    </>
  );
}
