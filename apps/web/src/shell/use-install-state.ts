"use client";

// Which "works best in the app" line a phone in a browser gets (the install bar), or none. Browser facts are read once
// the page is up (never while rendering on the server); the server's memory of who opened the installed app answers
// for Safari, which can't tell. Inside the installed app this notes the visit instead, which is what that memory holds.
import type { InstalledAppPlatform } from "@travel-crm/contracts/usage";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useMe } from "@/session/me-context";

export type InstallState = "none" | "installable" | "installed" | "ios";

/** How long × hides the bar in this browser (the owner, 2026-11-25). */
export const HIDE_FOR_MS = 7 * 24 * 60 * 60 * 1000;
export const HIDDEN_UNTIL_KEY = "install-bar-hidden-until";
/** When this browser last told the server this person opened the installed app; the server also writes at most once a day. */
export const visitKey = (userId: string) => `installed-app-visit-at.${userId}`;
const VISIT_EVERY_MS = 24 * 60 * 60 * 1000;
const HIDDEN_EVENT = "install-bar-hidden";

/** Chrome's `beforeinstallprompt` event, which the page's early script saves on `window` (pwa/install-prompt-capture). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
declare global {
  interface Window {
    deferredInstallPrompt?: InstallPromptEvent | null;
  }
  interface Navigator {
    standalone?: boolean;
    getInstalledRelatedApps?: () => Promise<unknown[]>;
  }
}

/** The browser storage's value, or null when it is blocked: the page works without it. */
function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Blocked storage only means the choice isn't remembered.
  }
}

/** The kind of phone, or null for a computer or an unknown browser. An iPad asks for the Mac site, so its touch screen gives it away. */
function phoneType(): InstalledAppPlatform | null {
  const agent = navigator.userAgent;
  // Safari (or a browser on its engine), or the installed app, whose agent may lack "Safari": an app's own web view in
  // a browser tab says no Safari and has no Add to Home Screen, and is never `navigator.standalone`.
  const safari = agent.includes("Safari/") || navigator.standalone === true;
  if (/iPhone|iPad|iPod/.test(agent)) return safari ? "ios" : null;
  if (agent.includes("Macintosh") && navigator.maxTouchPoints > 1) return safari ? "ios" : null;
  if (agent.includes("Android") && navigator.maxTouchPoints > 0) return "android";
  return null;
}

function inInstalledApp(): boolean {
  return navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

function hiddenNow(): boolean {
  return Number(stored(HIDDEN_UNTIL_KEY) ?? 0) > Date.now();
}

/** Hides the bar in this browser for a week (and for this page's life where storage is blocked: the bar hears the event). */
export function hideInstallBar(): void {
  store(HIDDEN_UNTIL_KEY, String(Date.now() + HIDE_FOR_MS));
  window.dispatchEvent(new Event(HIDDEN_EVENT));
}

/** Opens Chrome's install sheet, from the event saved when Chrome offered it; the bar goes once it is installed. */
export async function promptInstall(): Promise<void> {
  const saved = window.deferredInstallPrompt;
  if (!saved) return;
  try {
    await saved.prompt();
    await saved.userChoice;
  } catch {
    // A prompt that can't open is spent as well.
  }
  // A prompt can be used once; if the app was installed, `appinstalled` clears it as well.
  window.deferredInstallPrompt = null;
  window.dispatchEvent(new Event("install-prompt-saved"));
}

interface BrowserFacts {
  phone: InstalledAppPlatform | null;
  standalone: boolean;
  storedHidden: boolean;
  canPrompt: boolean;
}

let lastFacts: { key: string; facts: BrowserFacts } | null = null;

/** The browser's facts, the same object while they hold (React compares snapshots by identity). */
function browserFacts(): BrowserFacts {
  const facts: BrowserFacts = {
    phone: phoneType(),
    standalone: inInstalledApp(),
    storedHidden: hiddenNow(),
    canPrompt: Boolean(window.deferredInstallPrompt),
  };
  const key = JSON.stringify(facts);
  if (lastFacts?.key !== key) lastFacts = { key, facts };
  return lastFacts.facts;
}

const FACT_EVENTS = [HIDDEN_EVENT, "install-prompt-saved", "appinstalled"];

function watchFacts(changed: () => void): () => void {
  for (const name of FACT_EVENTS) window.addEventListener(name, changed);
  return () => {
    for (const name of FACT_EVENTS) window.removeEventListener(name, changed);
  };
}

export function useInstallState(): InstallState {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const userId = useMe().user.id;
  // Read from the browser, not while rendering on the server: there, and while hydrating, there are no facts and no bar.
  const facts = useSyncExternalStore(watchFacts, browserFacts, () => null);
  // What happened on this page that storage may not have kept: × pressed (blocked storage forgets it), the app installed.
  const [hiddenHere, setHiddenHere] = useState(false);
  const [installedHere, setInstalledHere] = useState(false);
  const [foundInstalled, setFoundInstalled] = useState(false);
  const noting = useRef(false);
  const phone = facts?.phone ?? null;
  const standalone = facts?.standalone ?? false;

  useEffect(() => {
    const onHidden = () => {
      setHiddenHere(true);
    };
    const onInstalled = () => {
      setInstalledHere(true);
    };
    window.addEventListener(HIDDEN_EVENT, onHidden);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener(HIDDEN_EVENT, onHidden);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Inside the installed app: note the visit, which is how a browser on this kind of phone learns the app is there.
  useEffect(() => {
    if (phone === null || !standalone) return;
    const key = visitKey(userId);
    if (noting.current || Date.now() - Number(stored(key) ?? 0) < VISIT_EVERY_MS) return;
    noting.current = true;
    // Kept only once the server has it, so an offline open is tried again at the next one.
    client.usage.installedAppSeen
      .mutate({ platform: phone })
      .then(() => {
        store(key, String(Date.now()));
      })
      .catch(() => undefined)
      .finally(() => {
        noting.current = false;
      });
  }, [client, phone, standalone, userId]);

  // In a browser on Android: Chrome can say whether the web app is installed (the manifest's related_applications).
  useEffect(() => {
    if (phone !== "android" || standalone || typeof navigator.getInstalledRelatedApps !== "function") return;
    let current = true;
    navigator
      .getInstalledRelatedApps()
      .then((apps) => {
        if (current) setFoundInstalled(apps.length > 0);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [phone, standalone]);

  const listening = phone !== null && !standalone && !facts?.storedHidden && !hiddenHere && !installedHere;
  const used = useQuery({ ...trpc.usage.installedApps.queryOptions(), enabled: listening });

  if (!listening) return "none";
  // Chrome offers the prompt only where the app isn't installed on this phone, so Install is the truth then.
  if (phone === "android" && facts?.canPrompt) return "installable";
  // No flipping after load: nothing until the server's memory has answered.
  if (used.isPending) return "none";
  if (used.data?.platforms.includes(phone)) return "installed";
  if (phone === "ios") return "ios";
  return foundInstalled ? "installed" : "none";
}
