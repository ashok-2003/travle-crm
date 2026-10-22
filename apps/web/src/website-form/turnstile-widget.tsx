"use client";

// Cloudflare Turnstile above the Send button (W39), in managed mode: most people see nothing. The script is loaded once, only
// for a form whose server has keys, and this file is loaded only then too (the form lazy-imports it). A token works once, so
// the form changes `resetKey` after every refused send and a new one is asked for. A script that cannot load or a widget that
// errors says so with onUnavailable, and the form then lets Send go: the server decides (it fails open, W39).
import { useEffect, useEffectEvent, useRef } from "react";

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
    loadTurnstile()
      .then((api) => {
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
        failed();
      });
    return () => {
      cancelled = true;
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
