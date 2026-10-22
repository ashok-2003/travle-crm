"use client";

// Waits for the Turnstile widget's next token, for a resend: a token is verified once, so the resend after a fault takes a
// new one. `arrived` is the widget's token callback; `next` asks for a new one and resolves with it, or rejects if the widget
// gives none in time.
import { useRef } from "react";

export function useTokenWaiter(onTokenChange: (token: string | null) => void, askForNew: () => void, waitMs: number) {
  const waiter = useRef<((token: string) => void) | null>(null);
  return {
    arrived: (token: string | null) => {
      onTokenChange(token);
      if (token !== null) waiter.current?.(token);
    },
    next: (): Promise<string> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiter.current = null;
          reject(new Error("no new token"));
        }, waitMs);
        waiter.current = (token) => {
          clearTimeout(timer);
          waiter.current = null;
          resolve(token);
        };
        onTokenChange(null);
        askForNew();
      }),
  };
}
