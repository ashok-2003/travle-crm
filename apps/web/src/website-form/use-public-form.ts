"use client";

// The form for a key, and the way to send an enquiry for it. After 6 seconds without an answer the state is "waking"
// (the api sleeps when quiet); an api that does not answer keeps being asked after 3, then 5, then every 10 seconds, for 90 seconds, then "failed".
// An expired opened-token is replaced and the enquiry sent again unseen (W37).
import type { WebsiteEnquiryInput } from "@travel-crm/contracts/website-forms";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPublicForm, type LoadedForm } from "./load-form";
import { FormRefusal } from "./refusal";
import { postEnquiry, sleep } from "./send-enquiry";

export const WAKING_AFTER_MS = 6_000;
export const WAKE_BUDGET_MS = 90_000;
/** The wait before the next ask: 3 seconds, then 5, then 10 from then on, so a down api is not hammered. */
export const wakeDelay = (asked: number) => [3_000, 5_000][asked - 1] ?? 10_000;
/** A new token is two seconds old at best, and an enquiry sent sooner is refused as too fast (W37). */
export const FRESH_TOKEN_WAIT_MS = 2_100;

export type PublicFormState = LoadedForm | { state: "loading" } | { state: "waking" };

/** The host a page is embedded on, as its referrer names it; "Embedded" when it names none a lead could show. */
export function embeddedOnOf(referrer: string): string {
  try {
    const { host } = new URL(referrer);
    return /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) && host.length <= 80 ? host : "Embedded";
  } catch {
    return "Embedded";
  }
}

async function loadWithPatience(
  key: string,
  via: "hosted" | "embedded",
  signal: AbortSignal,
): Promise<LoadedForm | null> {
  const giveUpAt = Date.now() + WAKE_BUDGET_MS;
  for (let asked = 1; ; asked++) {
    const answer = await fetchPublicForm(key, via, signal);
    if (signal.aborted) return null;
    if (answer !== "asleep") return answer;
    const wait = wakeDelay(asked);
    if (Date.now() + wait > giveUpAt) return { state: "failed" };
    await sleep(wait, signal);
  }
}

export function usePublicForm(key: string, mode: "hosted" | "embedded") {
  const [loaded, setLoaded] = useState<PublicFormState>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const freshToken = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const wakingTimer = setTimeout(() => {
      setLoaded((now) => (now.state === "loading" ? { state: "waking" } : now));
    }, WAKING_AFTER_MS);
    void loadWithPatience(key, mode, controller.signal).then((answer) => {
      if (answer !== null) setLoaded(answer);
    });
    return () => {
      controller.abort();
      clearTimeout(wakingTimer);
    };
  }, [key, mode, attempt]);

  const retry = useCallback(() => {
    setLoaded({ state: "loading" });
    setAttempt((count) => count + 1);
  }, []);

  const send = useCallback(
    async (body: WebsiteEnquiryInput): Promise<void> => {
      const enquiry = {
        ...body,
        openedToken: freshToken.current ?? body.openedToken,
        ...(mode === "embedded" && { embeddedOn: embeddedOnOf(document.referrer) }),
      };
      try {
        await postEnquiry(key, enquiry);
      } catch (error) {
        if (!(error instanceof FormRefusal) || error.reason !== "FORM_EXPIRED") throw error;
        const fresh = await fetchPublicForm(key, mode);
        if (fresh === "asleep" || fresh.state !== "ready") throw error;
        freshToken.current = fresh.form.openedToken;
        await sleep(FRESH_TOKEN_WAIT_MS);
        await postEnquiry(key, { ...enquiry, openedToken: fresh.form.openedToken });
      }
    },
    [key, mode],
  );

  return { loaded, send, retry };
}
