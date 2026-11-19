// A list's numbered pages (web revamp part 3, after AiGuru's): "Showing 21–40 of 349 leads", Rows per page (10, 20, 50,
// 100; the owner's 20 by default), "Page 2 of 18", then first, previous, next and last, named in their tooltips and
// disabled at the ends.
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TablePagination } from "@/components/table-pagination";
import { locale, messages } from "@/i18n/messages";

const words = messages.common.pagination;

function renderBar(props: Partial<Parameters<typeof TablePagination>[0]> = {}) {
  const onPage = vi.fn();
  const onSize = vi.fn();
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <TablePagination page={2} size={20} total={349} noun="leads" onPage={onPage} onSize={onSize} {...props} />
    </NextIntlClientProvider>,
  );
  const bar = screen.getByRole("navigation", { name: words.label });
  const button = (name: string) => within(bar).getByRole("button", { name });
  return { bar, button, onPage, onSize };
}

const noop = () => undefined;

beforeEach(() => {
  // Radix's Select reaches for pointer capture and scrolling, and an open tooltip measures itself: jsdom can't.
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: noop,
    scrollIntoView: noop,
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = noop;
      unobserve = noop;
      disconnect = noop;
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TablePagination", () => {
  it("says which rows it shows of how many, and the page of how many, in Indian digits", () => {
    const { bar } = renderBar();
    expect(bar).toHaveTextContent("Showing 21–40 of 349 leads");
    expect(bar).toHaveTextContent("Page 2 of 18");
    cleanup();
    expect(renderBar({ page: 6173, total: 1_23_456 }).bar).toHaveTextContent(
      "Showing 1,23,441–1,23,456 of 1,23,456 leads",
    );
  });

  it("goes to the first, previous, next and last pages", async () => {
    const { button, onPage } = renderBar();
    for (const [name, page] of [
      [words.first, 1],
      [words.previous, 1],
      [words.next, 3],
      [words.last, 18],
    ] as const) {
      await userEvent.click(button(name));
      expect(onPage).toHaveBeenLastCalledWith(page);
    }
  });

  it("disables the way back on the first page and the way on at the last, and every way while a page loads", () => {
    const first = renderBar({ page: 1 });
    expect(first.button(words.first)).toBeDisabled();
    expect(first.button(words.previous)).toBeDisabled();
    expect(first.button(words.next)).toBeEnabled();
    cleanup();
    const last = renderBar({ page: 18 });
    expect(last.bar).toHaveTextContent("Showing 341–349 of 349 leads");
    expect(last.button(words.next)).toBeDisabled();
    expect(last.button(words.last)).toBeDisabled();
    expect(last.button(words.previous)).toBeEnabled();
    cleanup();
    const busy = renderBar({ busy: true });
    for (const name of [words.first, words.previous, words.next, words.last]) expect(busy.button(name)).toBeDisabled();
  });

  it("offers 10, 20, 50 and 100 rows a page", async () => {
    const { bar, onSize } = renderBar();
    const size = within(bar).getByRole("combobox", { name: words.rowsPerPage });
    expect(size).toHaveTextContent("20");
    await userEvent.click(size);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["10", "20", "50", "100"]);
    await userEvent.click(screen.getByRole("option", { name: "50" }));
    expect(onSize).toHaveBeenCalledWith(50);
  });

  it("is one page for a short list, its ways on and back disabled", () => {
    const { bar, button } = renderBar({ page: 1, total: 3 });
    expect(bar).toHaveTextContent("Showing 1–3 of 3 leads");
    expect(bar).toHaveTextContent("Page 1 of 1");
    for (const name of [words.first, words.previous, words.next, words.last]) expect(button(name)).toBeDisabled();
  });
});
