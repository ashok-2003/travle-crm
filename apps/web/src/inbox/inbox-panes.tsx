"use client";

// How the Inbox's panes share a computer's screen (inbox revamp spec, part 1 item 2), the chat first: the list takes
// clamp(300px, 24%, 400px) of the inbox (inbox-screen.tsx's grid), the chat everything left, never under 520px, and the
// contact panel clamp(300px, 22%, 380px) beside it when it fits; when it would push the chat under its 520px, it floats
// over the chat's right edge instead. So the chat keeps its 520px, the list and the chat share the screen from 1024px;
// narrower, the Inbox shows one pane at a time as on a phone (the list, then the chat with a way back). Whether the panel
// beside the chat is open is kept in this browser.
import { createContext, useContext, useEffect, useState, type ReactNode, type RefObject } from "react";
import { useMediaQuery } from "@/lib/use-media-query";

const LIST = { min: 300, share: 0.24, max: 400 };
const PANEL = { min: 300, share: 0.22, max: 380 };
export const CHAT_MIN_WIDTH = 520;
/** From this wide a screen, the list and the chat sit side by side. */
export const TWO_PANES_FROM = 1024;

/** Whether the list and the chat sit side by side (1024px and wider); else one at a time, as on a phone. */
export function useInboxTwoPanes(): boolean {
  return useMediaQuery(`(min-width: ${String(TWO_PANES_FROM)}px)`);
}
/** The two vertical separators: list | chat | panel. */
const SEPARATORS = 2;

const shareOf = ({ min, share, max }: typeof LIST, width: number) => Math.min(max, Math.max(min, share * width));

/** The panes of an inbox `width` pixels wide: the list's and the panel's widths, and whether the panel fits beside the chat. */
export function inboxPanes(width: number): { list: number; panel: number; panelDocks: boolean } {
  const list = shareOf(LIST, width);
  const panel = shareOf(PANEL, width);
  return { list, panel, panelDocks: width - list - panel - SEPARATORS >= CHAT_MIN_WIDTH };
}

const PANEL_KEY = "travel-crm.inbox.contact-panel";

function keptPanelOpen(): boolean {
  try {
    return window.localStorage.getItem(PANEL_KEY) === "open";
  } catch {
    return false;
  }
}

function keepPanelOpen(open: boolean): void {
  try {
    if (open) window.localStorage.setItem(PANEL_KEY, "open");
    else window.localStorage.removeItem(PANEL_KEY);
  } catch {
    // Blocked storage: the choice lasts while the Inbox is open.
  }
}

export interface InboxPanes {
  /** The contact panel's width, beside the chat or floating over it. */
  panelWidth: number;
  panelDocks: boolean;
  /** Whether the member keeps the panel open beside the chat (where it fits). */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
}

const PanesContext = createContext<InboxPanes | null>(null);

/** The Inbox's panes, for a chat beside the list; null elsewhere (a lead's page), where the panel is the sheet it always was. */
export function useInboxPanes(): InboxPanes | null {
  return useContext(PanesContext);
}

/** The width of an element, as it changes (0 until it is measured). */
export function useWidthOf(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver(() => {
      setWidth(element.getBoundingClientRect().width);
    });
    observer.observe(element);
    setWidth(element.getBoundingClientRect().width);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return width;
}

export function InboxPanesProvider({ width, children }: { width: number; children: ReactNode }) {
  const [panelOpen, setOpen] = useState(keptPanelOpen);
  const { panel, panelDocks } = inboxPanes(width);
  const value: InboxPanes = {
    panelWidth: panel,
    panelDocks,
    panelOpen,
    setPanelOpen: (open) => {
      setOpen(open);
      keepPanelOpen(open);
    },
  };
  return <PanesContext value={value}>{children}</PanesContext>;
}
