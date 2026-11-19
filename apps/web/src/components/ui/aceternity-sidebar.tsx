"use client";

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** The rail's width at rest and the panel's when open, in px. */
const RAIL_WIDTH = 60;
const PANEL_WIDTH = 256;
/** DESIGN.md's ease-out. */
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

interface PanelHandlers {
  ref: React.RefObject<HTMLDivElement | null>;
  onPointerEnter: (event: React.PointerEvent) => void;
  onPointerLeave: (event: React.PointerEvent) => void;
  onFocus: (event: React.FocusEvent) => void;
  onBlur: (event: React.FocusEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

interface SidebarContextProps {
  open: boolean;
  /** The touch button: opens the panel, or shuts it. */
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
 * Open while a mouse is over it, keyboard focus is in it, the touch button pinned it or a menu from it is open.
 * Escape, a choice or the button shut it by hand, and it stays shut until the pointer and the focus have both left.
 */
function usePanel(): SidebarContextProps {
  const ref = React.useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [holds, setHolds] = React.useState<ReadonlySet<string>>(new Set());
  const open = holds.size > 0 || (!dismissed && (hovered || focused || pinned));
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

  // A tap or click anywhere else shuts it.
  React.useEffect(() => {
    if (!open) return;
    const pressed = (event: PointerEvent) => {
      if (isWithin(ref.current, event.target)) return;
      setPinned(false);
      setDismissed(true);
    };
    document.addEventListener("pointerdown", pressed);
    return () => {
      document.removeEventListener("pointerdown", pressed);
    };
  }, [open]);

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
    hold,
    toggle: () => {
      if (open) {
        shut();
        return;
      }
      setPinned(true);
      setDismissed(false);
    },
    chose: shut,
    panel: {
      ref,
      // A touch screen has no hover: a tap is a tap, not a peek.
      onPointerEnter: (event) => {
        if (event.pointerType === "touch") return;
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

/** Holds the panel's state for its parts. Nothing is remembered: it is always the rail at rest. */
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
        animate={{ width: open ? PANEL_WIDTH : RAIL_WIDTH }}
        transition={{ duration: still ? 0 : 0.2, ease: EASE_OUT }}
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

/** The icon's 20px box (a 32px avatar centres on it); `dot`, a colour class, marks waiting work on its corner at rest. */
function SidebarIcon({ dot, children }: { dot?: string | undefined; children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className="relative flex size-5 shrink-0 items-center justify-center [&>svg]:size-5">
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
 * The row's words, 188px wide (the open panel's 256, less its padding, the icon and the gaps), shown once the panel has
 * opened and gone at once when it shuts; `aside` (a count) after them, for the eye only. They wrap, never clip.
 */
export function SidebarLabel({ aside, children }: { aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex w-[188px] shrink-0 items-center gap-2 opacity-0 group-data-[state=open]/panel:opacity-100 motion-safe:transition-opacity motion-safe:duration-75 motion-safe:group-data-[state=open]/panel:delay-100 motion-safe:group-data-[state=open]/panel:duration-150">
      <span className="min-w-0 flex-1 break-words motion-safe:transition-transform motion-safe:group-hover/row:translate-x-1">
        {children}
      </span>
      {aside !== undefined && (
        <span aria-hidden="true" className="flex shrink-0">
          {aside}
        </span>
      )}
    </span>
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

/** A row that only shows something (the agency's mark and name). */
export function SidebarRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={row}>
      <SidebarIcon>{icon}</SidebarIcon>
      <SidebarLabel>{children}</SidebarLabel>
    </div>
  );
}

/** A touch screen's way to open the panel, at the rail's top; a screen that can hover doesn't show it. */
export function SidebarToggle({ openLabel, closeLabel }: { openLabel: string; closeLabel: string }) {
  const { open, toggle } = useSidebar();
  return (
    <SidebarButton
      icon={open ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
      label={open ? closeLabel : openLabel}
      className="[@media(hover:hover)]:hidden"
      onClick={toggle}
    />
  );
}
