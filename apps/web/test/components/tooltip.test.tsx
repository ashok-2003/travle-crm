// The tooltip brings its own provider, so a screen can use one without the app's layout wrapping every page in it,
// and it names its trigger's description for screen readers.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Radix measures where the tooltip goes; jsdom can't.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = () => undefined;
    unobserve = () => undefined;
    disconnect = () => undefined;
  },
);

describe("Tooltip", () => {
  it("opens without a provider of the app's", async () => {
    render(
      <Tooltip open>
        <TooltipTrigger asChild>
          <Button>Seats</Button>
        </TooltipTrigger>
        <TooltipContent>Seats used of the plan's limit</TooltipContent>
      </Tooltip>,
    );
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Seats used of the plan's limit");
  });
});
