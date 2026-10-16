// The honest states every list has (DESIGN.md section 6): loading only after a pause, errors with a retry, a refusal
// saying its reason.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";
import { locale, messages } from "@/i18n/messages";
import { refusal, unanswered } from "../support/api-errors";

const withWords = (ui: ReactElement) => (
  <NextIntlClientProvider locale={locale} messages={messages}>
    {ui}
  </NextIntlClientProvider>
);

describe("Delayed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows nothing for the first 200ms, so a quick load never flashes a skeleton", () => {
    render(<Delayed>Loading list</Delayed>);
    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(screen.queryByText("Loading list")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText("Loading list")).toBeVisible();
  });
});

describe("ErrorState", () => {
  it("announces what failed and retries on request", async () => {
    const onRetry = vi.fn();
    render(withWords(<ErrorState message="Staff didn't load." retryLabel="Try again" onRetry={onRetry} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Staff didn't load.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("says a refusal's reason instead, since trying again gets the same answer", () => {
    render(
      withWords(
        <ErrorState
          message="Staff didn't load."
          error={refusal(403, "ORGANIZATION_CANCELLED")}
          retryLabel="Try again"
          onRetry={vi.fn()}
        />,
      ),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.reasons.ORGANIZATION_CANCELLED);
  });

  it("says what failed when the call got no answer, or none with a reason", () => {
    const { unmount } = render(
      withWords(
        <ErrorState message="Staff didn't load." error={unanswered()} retryLabel="Try again" onRetry={vi.fn()} />,
      ),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Staff didn't load.");
    unmount();
    render(
      withWords(
        <ErrorState message="Staff didn't load." error={refusal(500)} retryLabel="Try again" onRetry={vi.fn()} />,
      ),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Staff didn't load.");
  });
});
