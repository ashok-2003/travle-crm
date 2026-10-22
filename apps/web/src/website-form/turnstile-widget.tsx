"use client";

// Cloudflare Turnstile above the Send button (W39), in managed mode: most people see nothing. The script is loaded once, only
// for a form whose server has keys, and this file is loaded only then too (the form lazy-imports it). A token works once, so
// the form changes `resetKey` when a send spent it and a new one is asked for. A script that cannot load (or has not in ten
// seconds) or a widget that errors says so with onUnavailable; the form then offers Try again and never sends without a token.
import { useEffect, useEffectEvent, useRef } from "react";

/** How long the script may take before the widget is called unavailable. */
const LOAD_TIMEOUT_MS = 10_000;
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function loadTurnstile(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve(window.turnstile);
      return;
    }
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    if (script === null) {
      script = document.createElement("script");
      script.src = SCRIPT;
      script.setAttribute("async", "");
      script.setAttribute("defer", "");
      document.head.append(script);
    }
    script.addEventListener(
      "load",
      () => {
        if (window.turnstile) resolve(window.turnstile);
        else reject(new Error("Turnstile did not start"));
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => {
        reject(new Error("Turnstile did not load"));
      },
      { once: true },
    );
  });
}

export function TurnstileWidget({
  siteKey,
  resetKey,
  onToken,
  onUnavailable,
}: {
  siteKey: string;
  /** Changes when the current token is spent and a new one is needed. */
  resetKey: number;
  onToken: (token: string | null) => void;
  onUnavailable: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const gotToken = useEffectEvent(onToken);
  const failed = useEffectEvent(onUnavailable);

  useEffect(() => {
    let cancelled = false;
    const fail = () => {
      // A script that never loaded is taken away, so Try again fetches it anew.
      if (!window.turnstile) document.querySelector(`script[src="${SCRIPT}"]`)?.remove();
      failed();
    };
    const timer = setTimeout(fail, LOAD_TIMEOUT_MS);
    loadTurnstile()
      .then((api) => {
        clearTimeout(timer);
        if (cancelled || box.current === null) return;
        const id = api.render(box.current, {
          sitekey: siteKey,
          callback: (token) => {
            gotToken(token);
          },
          "expired-callback": () => {
            gotToken(null);
          },
          "error-callback": () => {
            failed();
          },
        });
        widget.current = { api, id };
      })
      .catch(() => {
        clearTimeout(timer);
        if (!cancelled) fail();
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (widget.current) widget.current.api.remove(widget.current.id);
      widget.current = null;
    };
  }, [siteKey]);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (widget.current) widget.current.api.reset(widget.current.id);
  }, [resetKey]);

  return <div ref={box} />;
}
