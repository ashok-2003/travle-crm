// The honest states every list has (DESIGN.md section 6): loading only after a pause, errors with a retry.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";

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
    render(<ErrorState message="Staff didn't load." retryLabel="Try again" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Staff didn't load.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
