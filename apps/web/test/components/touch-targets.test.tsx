// DESIGN.md section 4: every interactive element is at least 44x44px. jsdom has no layout, so this reads the size
// utilities each shadcn component puts on its interactive element (see touch-targets.ts). A new size that slips under
// 44px, or a checkbox shrunk back to shadcn's 16px, fails here instead of surfacing on a phone.
import { render, screen } from "@testing-library/react";
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
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { TableHead, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  it("a checkbox, through its hit area", () => {
    render(<Checkbox aria-label="Agree" />);
    expectTarget(screen.getByRole("checkbox"), { square: true });
  });

  it("a switch, through its hit area", () => {
    render(<Switch aria-label="Two-factor" />);
    expectTarget(screen.getByRole("switch"), { square: true });
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
      <>
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
      </>,
    );
    const closes = screen.getAllByRole("button", { name: "Close", hidden: true });
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
