// The small shared pieces every screen uses (P1): a refusal above a button (RefusalAlert), a list's loading rows
// (LoadingRows), the way to a list's next page (ShowMoreButton) and the text and back links (TextLink, BackLink).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { ShowMoreButton } from "@/components/show-more-button";
import { BackLink, TextLink } from "@/components/text-link";
import { locale, messages } from "@/i18n/messages";
import { refusal, unanswered } from "../support/api-errors";

const { common, errors } = messages;

function renderWithWords(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RefusalAlert", () => {
  it("says the api's reason in the registry's destructive alert, with its icon", () => {
    renderWithWords(<RefusalAlert error={refusal(403, "MISSING_PERMISSION")} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(errors.reasons.MISSING_PERMISSION);
    expect(alert).toHaveClass("text-destructive");
    expect(alert.querySelector("svg")).not.toBeNull();
  });

  it("says the connection failed when the call got no answer", () => {
    renderWithWords(<RefusalAlert error={unanswered()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(errors.network);
  });

  it("renders nothing without an error", () => {
    const { container } = renderWithWords(<RefusalAlert error={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("LoadingRows", () => {
  it("shows, after 200ms, one labelled busy status holding the rows in the list's shape", async () => {
    renderWithWords(<LoadingRows rows={3} shape="twoLines" label="Loading the organizations" />);
    expect(screen.queryByRole("status")).toBeNull();
    const status = await screen.findByRole("status", { name: "Loading the organizations" });
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status.children).toHaveLength(3);
    expect(status.firstElementChild).toHaveClass("h-20");
  });

  it("draws a table's header and rows when the list is a table", async () => {
    renderWithWords(<LoadingRows shape="table" rows={2} columns={3} />);
    const status = await screen.findByRole("status", { name: common.loading });
    expect(within(status).getAllByRole("columnheader")).toHaveLength(3);
    expect(within(status).getAllByRole("row")).toHaveLength(3);
  });

  it("says Loading by default, in four one-line rows", async () => {
    renderWithWords(<LoadingRows />);
    const status = await screen.findByRole("status", { name: common.loading });
    expect(status.children).toHaveLength(4);
    expect(status.firstElementChild).toHaveClass("h-14");
  });
});

describe("ShowMoreButton", () => {
  const pages = (overrides: Partial<{ hasNextPage: boolean; isFetchingNextPage: boolean }> = {}) => ({
    hasNextPage: true,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(() => Promise.resolve()),
    ...overrides,
  });

  it("asks for the next page", async () => {
    const list = pages();
    renderWithWords(<ShowMoreButton pages={list} label="Show more organizations" />);
    await userEvent.click(screen.getByRole("button", { name: "Show more organizations" }));
    expect(list.fetchNextPage).toHaveBeenCalledOnce();
  });

  it("says it is loading, and can't be pressed again meanwhile", () => {
    renderWithWords(<ShowMoreButton pages={pages({ isFetchingNextPage: true })} label="Show more organizations" />);
    expect(screen.getByRole("button", { name: common.loadingMore })).toBeDisabled();
  });

  it("is gone once there is no next page", () => {
    const { container } = renderWithWords(<ShowMoreButton pages={pages({ hasNextPage: false })} label="Show more" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("TextLink and BackLink", () => {
  it("wraps a long name rather than running past its row, keeping the 44px floor; inline, it has none", () => {
    render(
      <>
        <TextLink href="/console/organizations/1">Shree Balaji Tours and Travels Private Limited</TextLink>
        <TextLink href="/console/organizations/2" inline>
          Sharma Travels
        </TextLink>
      </>,
    );
    const alone = screen.getByRole("link", { name: "Shree Balaji Tours and Travels Private Limited" });
    expect(alone).toHaveClass("whitespace-normal", "h-auto", "min-h-11");
    expect(alone).not.toHaveClass("whitespace-nowrap", "h-11");
    const inline = screen.getByRole("link", { name: "Sharma Travels" });
    // As wide as its words, so a table cell's column of name and code keeps the name at the start.
    expect(inline).toHaveClass("whitespace-normal", "align-baseline", "w-fit");
    expect(inline).not.toHaveClass("min-h-11", "self-start");
  });

  it("are the registry's link Button, a 44px target, BackLink with an arrow before its words", () => {
    render(
      <>
        <TextLink href="/forgot-password">Forgot your password?</TextLink>
        <BackLink href="/settings" label="Settings" />
      </>,
    );
    const text = screen.getByRole("link", { name: "Forgot your password?" });
    const back = screen.getByRole("link", { name: "Settings" });
    for (const link of [text, back]) {
      expect(link).toHaveAttribute("data-variant", "link");
      expect(link).toHaveAttribute("data-size", "default");
    }
    expect(back).toHaveAttribute("href", "/settings");
    expect(back.firstElementChild?.tagName.toLowerCase()).toBe("svg");
  });
});
