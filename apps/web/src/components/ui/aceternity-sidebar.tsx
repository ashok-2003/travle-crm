"use client";

import { Bars3Icon, LockOpenIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { LockClosedIcon } from "@heroicons/react/24/solid";
import { motion, useReducedMotion, type Transition, type Variants } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** The rail's width at rest and the panel's when open, in px. */
const RAIL_WIDTH = 60;
const PANEL_WIDTH = 256;
/**
 * Real springs (owner, 2026-11-20: "kinetic, real physics"): opening, the panel overshoots a touch and settles, and its
 * rows' words follow one after another; shutting, it lands with less bounce and the words go at once. Reduced motion:
 * no movement at all.
 */
const OPENING: Transition = { type: "spring", visualDuration: 0.42, bounce: 0.28 };
const SHUTTING: Transition = { type: "spring", visualDuration: 0.32, bounce: 0.12 };
const STILL: Transition = { duration: 0 };

function panelMotion(still: boolean): Variants {
  return {
    open: {
      width: PANEL_WIDTH,
      transition: still ? STILL : { ...OPENING, delayChildren: 0.05, staggerChildren: 0.012 },
    },
    closed: { width: RAIL_WIDTH, transition: still ? STILL : SHUTTING },
  };
}

function labelMotion(still: boolean): Variants {
  return {
    open: { opacity: 1, x: 0, transition: still ? STILL : { type: "spring", visualDuration: 0.3, bounce: 0.25 } },
    closed: { opacity: 0, x: still ? 0 : -10, transition: still ? STILL : { duration: 0.06 } },
  };
}

/** Where this browser keeps the pin (a preference, nothing personal); every tab follows it. */
const DOCKED_KEY = "sidebar-docked";
/** The pin while storage is blocked: it holds for this visit alone. */
let dockedWithoutStorage = false;
const dockedListeners = new Set<() => void>();

function readDocked(): boolean {
  try {
    return window.localStorage.getItem(DOCKED_KEY) === "true";
  } catch {
    return dockedWithoutStorage;
  }
}

function writeDocked(docked: boolean) {
  dockedWithoutStorage = docked;
  try {
    if (docked) window.localStorage.setItem(DOCKED_KEY, "true");
    else window.localStorage.removeItem(DOCKED_KEY);
  } catch {
    // Kept in memory only.
  }
  for (const listener of dockedListeners) listener();
}

function subscribeDocked(listener: () => void) {
  dockedListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    dockedListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The pin, as this browser remembers it; the server's HTML and the first paint are the rail. */
function useDocked(): boolean {
  return React.useSyncExternalStore(subscribeDocked, readDocked, () => false);
}

interface PanelHandlers {
  ref: React.RefObject<HTMLDivElement | null>;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerLeave: (event: React.PointerEvent) => void;
  onFocus: (event: React.FocusEvent) => void;
  onBlur: (event: React.FocusEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

interface SidebarContextProps {
  open: boolean;
  /** Pinned open by its pin button: it stays open over the page until the pin is pressed again. */
  docked: boolean;
  /** The pin: keeps the panel open, or, pinned, lets it go and shuts it at once. */
  dock: () => void;
  /** The touch button: opens the panel, or shuts it (and lets go of the pin). */
  toggle: () => void;
  /** After a choice: shuts the panel, so the page it chose is clear, until the pointer and focus have left it. */
  chose: () => void;
  /** Keeps the panel open while a menu or popover opened from it is (its onOpenChange, under a key of its own). */
  hold: (key: string, held: boolean) => void;
  panel: PanelHandlers;
}

const SidebarContext = React.createContext<SidebarContextProps | undefined>(undefined);

export function useSidebar(): SidebarContextProps {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used within a Sidebar");
  return context;
}

/** The panel's own node, or a menu's, popover's or tooltip's that opened from it (Radix portals those out of it). */
function isWithin(panel: HTMLElement | null, node: EventTarget | null): boolean {
  return (
    node instanceof Element &&
    (panel?.contains(node) === true || node.closest("[data-radix-popper-content-wrapper]") !== null)
  );
}

/**
 * Open while it is pinned, a mouse is over it, keyboard focus is in it, the touch button opened it or a menu from it is
 * open. Escape, a choice or the button shut it by hand, and it stays shut until the pointer and the focus have both
 * left; pinned, only its pin (or the touch button) shuts it.
 */
function usePanel(): SidebarContextProps {
  const ref = React.useRef<HTMLDivElement>(null);
  const docked = useDocked();
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [holds, setHolds] = React.useState<ReadonlySet<string>>(new Set());
  const open = docked || holds.size > 0 || (!dismissed && (hovered || focused || pinned));
  if (dismissed && !hovered && !focused) setDismissed(false);

  // The panel's own leave misses a pointer whose menu shut under it: any move off the panel ends the hover.
  React.useEffect(() => {
    if (!hovered) return;
    const moved = (event: PointerEvent) => {
      if (event.pointerType !== "touch" && !isWithin(ref.current, event.target)) setHovered(false);
    };
    document.addEventListener("pointermove", moved);
    return () => {
      document.removeEventListener("pointermove", moved);
    };
  }, [hovered]);

  // A tap or click anywhere else shuts it, unless it is pinned.
  React.useEffect(() => {
    if (!open || docked) return;
    const pressed = (event: PointerEvent) => {
      if (isWithin(ref.current, event.target)) return;
      setPinned(false);
      setDismissed(true);
    };
    document.addEventListener("pointerdown", pressed);
    return () => {
      document.removeEventListener("pointerdown", pressed);
    };
  }, [open, docked]);

  const shut = () => {
    setPinned(false);
    setDismissed(true);
  };
  const hold = React.useCallback((key: string, held: boolean) => {
    setHolds((current) => {
      const next = new Set(current);
      if (held) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  return {
    open,
    docked,
    hold,
    dock: () => {
      writeDocked(!docked);
      if (docked) shut();
    },
    toggle: () => {
      if (open) {
        writeDocked(false);
        shut();
        return;
      }
      setPinned(true);
      setDismissed(false);
    },
    chose: shut,
    panel: {
      ref,
      // A peek is asked for by moving over it: a page whose layout shifts under a resting mouse (one parked in the
      // corner) sends an enter without a move, and must not open it. A touch screen has no hover: a tap is a tap.
      onPointerMove: (event) => {
        if (event.pointerType === "touch" || hovered) return;
        setHovered(true);
        setDismissed(false);
      },
      onPointerLeave: (event) => {
        if (event.pointerType !== "touch" && !isWithin(ref.current, event.relatedTarget)) setHovered(false);
      },
      // The keyboard's focus opens it; a click's focus (not focus-visible) leaves it to the pointer.
      onFocus: (event) => {
        if (event.target.matches(":focus-visible")) setFocused(true);
      },
      // Focus that moves off it, to the page or to nothing (a click on the page's plain words, another window).
      onBlur: (event) => {
        if (!isWithin(ref.current, event.relatedTarget)) setFocused(false);
      },
      // A menu open from it takes its own Escape.
      onKeyDown: (event) => {
        if (event.key === "Escape" && open && holds.size === 0) shut();
      },
    },
  };
}

/** Holds the panel's state for its parts. Only the pin is remembered; unpinned, it is always the rail at rest. */
export function Sidebar({ children }: { children: React.ReactNode }) {
  const value = usePanel();
  return (
    <SidebarContext.Provider value={value}>
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </SidebarContext.Provider>
  );
}

/**
 * The 60px rail, fixed to the window's left edge, with its place kept in the page's flow, so the page beside it never
 * moves. Open, the same panel widens over the page with the floating shadow. Phones don't show it.
 */
export function SidebarBody({ className, children }: { className?: string; children: React.ReactNode }) {
  const { open, panel } = useSidebar();
  const still = useReducedMotion() === true;
  return (
    <>
      <div aria-hidden="true" className="hidden shrink-0 md:block" style={{ width: RAIL_WIDTH }} />
      <motion.div
        {...panel}
        data-slot="aceternity-sidebar"
        data-state={open ? "open" : "closed"}
        initial={false}
        variants={panelMotion(still)}
        animate={open ? "open" : "closed"}
        className={cn(
          "group/panel fixed inset-y-0 left-0 z-(--z-dropdown) hidden flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground data-[state=open]:shadow-lg motion-safe:transition-shadow md:flex",
          className,
        )}
      >
        {children}
      </motion.div>
    </>
  );
}

export function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex shrink-0 flex-col gap-0.5 px-2 pt-3 pb-2", className)} {...props} />;
}

/** The part that scrolls when the window is short, with no scrollbar, which would take the rail's width. */
export function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-2 py-1 [scrollbar-width:none]",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex shrink-0 flex-col px-2 pt-2 pb-3", className)} {...props} />;
}

export function SidebarSeparator({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("mx-2 my-2 h-px shrink-0 bg-sidebar-border", className)} />;
}

// A row: its icon centred in the rail's 44px column, its words beside it at a fixed width, so nothing reflows while
// the panel widens; the panel's edge hides them at rest.
const row =
  "relative flex min-h-11 w-full shrink-0 items-center gap-3 overflow-hidden rounded-lg py-2 pr-2 pl-3 text-left text-sm font-medium text-sidebar-foreground";
/**
 * A row you press: hover in the quiet hairline tone; the current page in a matte neon (owner, 2026-11-20): a flat fill of
 * the accent with its own ink, and a soft glow of the accent a little below it. At rest only its icon square shows.
 */
const pressable = cn(
  row,
  "group/row hover:bg-sidebar-border aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground aria-[current=page]:shadow-[0_4px_14px_-2px_color-mix(in_srgb,var(--sidebar-accent)_40%,transparent)]",
);

/** The icon's 20px box (a 32px avatar centres on it), an outline icon's stroke at 2 (owner: bolder than Heroicons' 1.5); `dot`, a colour class, marks waiting work on its corner at rest. */
function SidebarIcon({ dot, children }: { dot?: string | undefined; children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="relative flex size-5 shrink-0 items-center justify-center [&>svg]:size-5 [&>svg]:stroke-2"
    >
      {children}
      {dot !== undefined && (
        <span
          data-slot="sidebar-dot"
          className={cn(
            "absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-sidebar group-data-[state=open]/panel:opacity-0 motion-safe:transition-opacity",
            dot,
          )}
        />
      )}
    </span>
  );
}

/**
 * The row's words, 188px wide (the open panel's 256, less its padding, the icon and the gaps; less a button beside them
 * when `narrow`), sliding in on a spring after the panel's opening, row after row, and gone at once when it shuts;
 * `aside` (a count) after them, for the eye only. They wrap, never clip.
 */
export function SidebarLabel({
  aside,
  narrow = false,
  children,
}: {
  aside?: React.ReactNode;
  narrow?: boolean;
  children: React.ReactNode;
}) {
  const still = useReducedMotion() === true;
  return (
    <motion.span
      variants={labelMotion(still)}
      className={cn("flex shrink-0 items-center gap-2", narrow ? "w-[140px]" : "w-[188px]")}
    >
      <span className="min-w-0 flex-1 break-words motion-safe:transition-transform motion-safe:group-hover/row:translate-x-1">
        {children}
      </span>
      {aside !== undefined && (
        <span aria-hidden="true" className="flex shrink-0">
          {aside}
        </span>
      )}
    </motion.span>
  );
}

/** The row's name in a tooltip beside the rail while the panel is shut (after Escape or a choice). */
function RailTooltip({ label, children }: { label: string; children: React.ReactElement }) {
  const { open } = useSidebar();
  // Never wanted while the panel is open, nor kept from then: it would show the moment the panel shut.
  const [shown, setShown] = React.useState(false);
  if (open && shown) setShown(false);
  return (
    <Tooltip
      open={shown}
      onOpenChange={(next) => {
        setShown(next && !open);
      }}
    >
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

interface RowParts {
  icon: React.ReactNode;
  label: string;
  /** A colour class: the dot on the icon's corner at rest, for waiting work. */
  dot?: string | undefined;
  /** Shown after the words while open (a count's pill), for the eye only: say it in a description too. */
  aside?: React.ReactNode;
}

/** A destination; choosing it shuts the panel. */
export function SidebarLink({
  icon,
  label,
  dot,
  aside,
  current = false,
  description,
  className,
  onClick,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "children"> &
  RowParts & {
    current?: boolean;
    /** Read after the name (a count's words). */
    description?: string | undefined;
  }) {
  const { chose } = useSidebar();
  const descriptionId = React.useId();
  return (
    <RailTooltip label={label}>
      <Link
        aria-current={current ? "page" : undefined}
        aria-describedby={description === undefined ? undefined : descriptionId}
        className={cn(pressable, className)}
        onClick={(event) => {
          onClick?.(event);
          chose();
        }}
        {...props}
      >
        <SidebarIcon dot={dot}>{icon}</SidebarIcon>
        <SidebarLabel aside={aside}>{label}</SidebarLabel>
        {description !== undefined && (
          <span id={descriptionId} hidden>
            {description}
          </span>
        )}
      </Link>
    </RailTooltip>
  );
}

/** A row that is a button; a menu's or a popover's trigger takes it as its child. */
export function SidebarButton({
  icon,
  label,
  dot,
  aside,
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "children"> & RowParts) {
  return (
    <RailTooltip label={label}>
      <button type="button" className={cn(pressable, className)} {...props}>
        <SidebarIcon dot={dot}>{icon}</SidebarIcon>
        <SidebarLabel aside={aside}>{label}</SidebarLabel>
      </button>
    </RailTooltip>
  );
}

/** A row that only shows something (the agency's mark and name), with a button of its own at its end (the pin). */
export function SidebarRow({
  icon,
  action,
  children,
}: {
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(row, action !== undefined && "py-0 pr-0")}>
      <SidebarIcon>{icon}</SidebarIcon>
      <SidebarLabel narrow={action !== undefined}>{children}</SidebarLabel>
      {action}
    </div>
  );
}

/**
 * The pin (a padlock: open, then shut while pinned), at the end of the agency's row, seen while the panel is open: pressed, the panel stays open over the page
 * (the page never moves) on every page until it is pressed again, which shuts it at once (owner, 2026-11-20).
 */
export function SidebarDock({ label }: { label: string }) {
  const { open, docked, dock } = useSidebar();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={docked}
          // Out of the rail at rest, so out of the keyboard's way until the panel is open.
          tabIndex={open ? undefined : -1}
          onClick={dock}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/75 opacity-0 group-data-[state=open]/panel:opacity-100 hover:bg-sidebar-border hover:text-sidebar-foreground aria-pressed:text-sidebar-foreground motion-safe:transition-opacity [&>svg]:size-5 [&>svg]:stroke-2"
        >
          {docked ? <LockClosedIcon aria-hidden="true" /> : <LockOpenIcon aria-hidden="true" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/** A touch screen's way to open the panel, at the rail's top; a screen that can hover doesn't show it. */
export function SidebarToggle({ openLabel, closeLabel }: { openLabel: string; closeLabel: string }) {
  const { open, toggle } = useSidebar();
  return (
    <SidebarButton
      icon={open ? <XMarkIcon /> : <Bars3Icon />}
      label={open ? closeLabel : openLabel}
      className="[@media(hover:hover)]:hidden"
      onClick={toggle}
    />
  );
}
