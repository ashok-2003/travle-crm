// DESIGN.md section 4: every interactive element is at least 44x44px. jsdom has no layout, so this reads the size
// utilities each shadcn component puts on its interactive element (see touch-targets.ts). A new size that slips under
// 44px, or a checkbox shrunk back to shadcn's 16px, fails here instead of surfacing on a phone.
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Item } from "@/components/ui/item";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SidebarMenuButton, SidebarProvider } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { TableHead, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { locale, messages } from "@/i18n/messages";
import { targetSize } from "./touch-targets";

// Radix measures and scrolls open menus; jsdom has neither.
const noop = () => undefined;
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
  },
);
Object.assign(Element.prototype, { scrollIntoView: noop, hasPointerCapture: () => false });
// The sidebar asks whether the screen is wide; this one is.
vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: noop, removeEventListener: noop }));

function expectTarget(element: Element, { square = false } = {}) {
  const { width, height } = targetSize(element);
  expect(height, `${element.className} height`).toBeGreaterThanOrEqual(44);
  if (square) expect(width, `${element.className} width`).toBeGreaterThanOrEqual(44);
}

describe("touch targets", () => {
  it.each(["default", "sm", "lg", "icon", "icon-lg"] as const)("a %s button", (size) => {
    render(<Button size={size}>Go</Button>);
    expectTarget(screen.getByRole("button"), { square: size.startsWith("icon") });
  });

  it("an input", () => {
    render(<Input aria-label="Name" />);
    expectTarget(screen.getByRole("textbox"));
  });

  it("an input group's input", () => {
    render(
      <InputGroup>
        <InputGroupInput aria-label="Name" />
      </InputGroup>,
    );
    expectTarget(screen.getByRole("group"));
    expectTarget(screen.getByRole("textbox"));
  });

  it.each(["sm", "icon-sm"] as const)("an input group's %s button", (size) => {
    render(<InputGroupButton size={size} aria-label="Show" />);
    expectTarget(screen.getByRole("button"), { square: size === "icon-sm" });
  });

  it.each(["default", "lg"] as const)(
    "a %s sidebar menu button, at least 44px so a wrapping name can grow it",
    (size) => {
      render(
        <SidebarProvider>
          <SidebarMenuButton size={size}>Staff</SidebarMenuButton>
        </SidebarProvider>,
      );
      expect(screen.getByRole("button").className).toMatch(/(^| )min-h-1[12]( |$)/);
      expectTarget(screen.getByRole("button"));
    },
  );

  it.each(["default", "sm"] as const)("a %s item that is a link", (size) => {
    render(
      <Item size={size} asChild>
        <a href="/staff">Staff</a>
      </Item>,
    );
    expectTarget(screen.getByRole("link"));
  });

  it("a checkbox, through its hit area", () => {
    render(<Checkbox aria-label="Agree" />);
    // The hit area is a pseudo-element placed over the box: it counts only when absolute, on a positioned element.
    expect(screen.getByRole("checkbox")).toHaveClass("relative", "after:absolute");
    expectTarget(screen.getByRole("checkbox"), { square: true });
  });

  it("a radio button, through its hit area", () => {
    render(
      <RadioGroup aria-label="Cycle" defaultValue="monthly">
        <RadioGroupItem value="monthly" aria-label="Monthly" />
      </RadioGroup>,
    );
    expect(screen.getByRole("radio")).toHaveClass("relative", "after:absolute");
    expectTarget(screen.getByRole("radio"), { square: true });
  });

  it("a text area", () => {
    render(<Textarea aria-label="Note" />);
    expectTarget(screen.getByRole("textbox"));
  });

  it("a switch, through its hit area", () => {
    render(<Switch aria-label="Two-factor" />);
    expect(screen.getByRole("switch")).toHaveClass("relative", "after:absolute");
    expectTarget(screen.getByRole("switch"), { square: true });
  });

  it("reads the size class that wins, as cn merges them, so a caller's className can't shrink a target unseen", () => {
    render(
      <>
        <Button className="h-8">Plain</Button>
        <Button size="icon" className="h-8" aria-label="Icon" />
        <div data-testid="at-least" className="min-h-11 h-8" />
      </>,
    );
    // size-11 then h-8: both stay, and the later h-8 sets the height.
    expect(targetSize(screen.getByRole("button", { name: "Plain" })).height).toBe(32);
    expect(targetSize(screen.getByRole("button", { name: "Icon" })).height).toBe(32);
    // min-height is its own property: h-8 can't take an element under it.
    expect(targetSize(screen.getByTestId("at-least")).height).toBe(44);
  });

  it("counts a hit area only from an absolute pseudo-element on a positioned element", () => {
    render(
      <>
        <Checkbox aria-label="Static" className="after:static" />
        <div data-testid="unpositioned" className="size-5 after:absolute after:-inset-3" />
      </>,
    );
    expect(targetSize(screen.getByRole("checkbox")).height).toBe(20);
    expect(targetSize(screen.getByTestId("unpositioned")).height).toBe(20);
  });

  it("tab triggers", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expectTarget(screen.getByRole("tab"));
  });

  it("table rows and headers", () => {
    render(
      <table>
        <tbody>
          <TableRow data-testid="row" />
        </tbody>
      </table>,
    );
    render(
      <table>
        <thead>
          <tr>
            <TableHead data-testid="head">Name</TableHead>
          </tr>
        </thead>
      </table>,
    );
    expectTarget(screen.getByTestId("row"));
    expectTarget(screen.getByTestId("head"));
  });

  it("the select trigger and its options", () => {
    render(
      <Select defaultOpen defaultValue="a">
        <SelectTrigger aria-label="Role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Admin</SelectItem>
        </SelectContent>
      </Select>,
    );
    expectTarget(screen.getByRole("combobox", { hidden: true }));
    expectTarget(screen.getByRole("option", { hidden: true }));
  });

  it("dropdown menu items", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Edit</DropdownMenuItem>
          <DropdownMenuCheckboxItem checked>Show</DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup value="a">
            <DropdownMenuRadioItem value="a">Pick</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    for (const role of ["menuitem", "menuitemcheckbox", "menuitemradio"])
      expectTarget(screen.getByRole(role, { hidden: true }));
  });

  it("the dialog and sheet close buttons", () => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <Dialog open>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Body</DialogDescription>
          </DialogContent>
        </Dialog>
        <Sheet open>
          <SheetContent>
            <SheetTitle>Title</SheetTitle>
            <SheetDescription>Body</SheetDescription>
          </SheetContent>
        </Sheet>
      </NextIntlClientProvider>,
    );
    const closes = screen.getAllByRole("button", { name: messages.common.close, hidden: true });
    expect(closes).toHaveLength(2);
    for (const close of closes) expectTarget(close, { square: true });
  });

  it("one-time-code slots", () => {
    render(
      <InputOTP maxLength={2}>
        <InputOTPGroup>
          <InputOTPSlot index={0} data-testid="slot" />
        </InputOTPGroup>
      </InputOTP>,
    );
    expectTarget(screen.getByTestId("slot"), { square: true });
  });
});
