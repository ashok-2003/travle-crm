"use client";

// Starts waking a sleeping api as soon as the person starts on the sign-in page (a tap, a click or a key), so it is up
// by the time they have typed; a page opened and left alone (a link preview, a robot) asks the api nothing.
import { useEffect } from "react";
import { authClient, type AuthClient } from "@/data/auth-client";

const firstMoves = ["pointerdown", "keydown", "focusin"] as const;

export function WakeOnOpen({ wake = authClient.wake }: { wake?: AuthClient["wake"] }) {
  useEffect(() => {
    const start = () => {
      for (const move of firstMoves) document.removeEventListener(move, start);
      void wake();
    };
    for (const move of firstMoves) document.addEventListener(move, start, { once: true });
    return () => {
      for (const move of firstMoves) document.removeEventListener(move, start);
    };
  }, [wake]);
  return null;
}
