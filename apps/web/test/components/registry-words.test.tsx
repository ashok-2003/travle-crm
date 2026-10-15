// The registry's screen-reader words are the app's messages too (ADR 0018: every word on screen is a next-intl
// message), and a busy button reads as its own label: the spinner beside it is decoration, not a second "Loading".
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { locale, messages } from "@/i18n/messages";

/** The app's messages, with "close" worded so a typed-in "Close" can't pass for it. */
function withMessages(children: ReactNode) {
  const reworded = { ...messages, common: { ...messages.common, close: "Shut this" } };
  return (
    <NextIntlClientProvider locale={locale} messages={reworded}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("the registry's words", () => {
  it("take the dialog's and the sheet's Close from the messages", () => {
    render(
      withMessages(
        <>
          <Dialog open>
            <DialogContent>
              <DialogTitle>Title</DialogTitle>
              <DialogDescription>Body</DialogDescription>
              <DialogFooter showCloseButton />
            </DialogContent>
          </Dialog>
          <Sheet open>
            <SheetContent>
              <SheetTitle>Title</SheetTitle>
              <SheetDescription>Body</SheetDescription>
            </SheetContent>
          </Sheet>
        </>,
      ),
    );
    expect(screen.getAllByRole("button", { name: "Shut this", hidden: true })).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Close", hidden: true })).toBeNull();
  });

  it("leave a busy button named by its own label, with no spinner announced beside it", () => {
    render(
      <Button disabled>
        <Spinner />
        Signing in
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Signing in" })).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
