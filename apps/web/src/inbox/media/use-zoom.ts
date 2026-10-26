"use client";

// Zoom and pan for the media viewer, by hand and by finger: the wheel and the buttons zoom, two fingers pinch, one finger or
// the mouse drags a zoomed picture, and a double tap or click toggles 1x and 2x. A picture at 1x is not dragged: a flick
// sideways asks for the next or the previous one, a flick down for the viewer to close.
import { useRef, useState, type PointerEvent, type WheelEvent } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const SWIPE_PX = 70;
const clamp = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

interface Point {
  x: number;
  y: number;
}
export type Swipe = "next" | "previous" | "close";

export function useZoom(onSwipe: (swipe: Swipe) => void) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const fingers = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const grab = useRef<{ from: Point; at: Point } | null>(null);

  const zoomTo = (scale: number) => {
    setView((now) => (clamp(scale) === 1 ? { scale: 1, x: 0, y: 0 } : { ...now, scale: clamp(scale) }));
  };
  const distance = () => {
    const [a, b] = [...fingers.current.values()];
    return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
  };

  return {
    view,
    zoomBy: (factor: number) => {
      zoomTo(view.scale * factor);
    },
    reset: () => {
      zoomTo(1);
    },
    handlers: {
      onWheel: (event: WheelEvent) => {
        zoomTo(view.scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
      },
      onDoubleClick: () => {
        zoomTo(view.scale > 1 ? 1 : 2);
      },
      onPointerDown: (event: PointerEvent) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (fingers.current.size === 2) pinch.current = { distance: distance(), scale: view.scale };
        else grab.current = { from: { x: event.clientX, y: event.clientY }, at: { x: view.x, y: view.y } };
      },
      onPointerMove: (event: PointerEvent) => {
        if (!fingers.current.has(event.pointerId)) return;
        fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (fingers.current.size === 2 && pinch.current !== null && pinch.current.distance > 0) {
          zoomTo((pinch.current.scale * distance()) / pinch.current.distance);
        } else if (grab.current !== null && view.scale > 1) {
          const { from, at } = grab.current;
          setView((now) => ({ ...now, x: at.x + event.clientX - from.x, y: at.y + event.clientY - from.y }));
        }
      },
      onPointerUp: (event: PointerEvent) => {
        const moved = grab.current;
        fingers.current.delete(event.pointerId);
        pinch.current = null;
        grab.current = null;
        if (moved === null || view.scale > 1 || fingers.current.size > 0) return;
        const dx = event.clientX - moved.from.x;
        const dy = event.clientY - moved.from.y;
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) onSwipe(dx < 0 ? "next" : "previous");
        else if (dy > SWIPE_PX * 1.3) onSwipe("close");
      },
      onPointerCancel: (event: PointerEvent) => {
        fingers.current.delete(event.pointerId);
        pinch.current = null;
        grab.current = null;
      },
    },
  };
}
