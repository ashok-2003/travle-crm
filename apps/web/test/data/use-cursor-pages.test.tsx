// A list a page at a time by the api's cursor: the first page asks with none, each next page with the cursor the page
// before gave, and the pages' items come as one list; without a next cursor there is no next page.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useCursorPages } from "@/data/use-cursor-pages";

interface Page {
  names: string[];
  nextCursor: string | null;
}

const first: Page = { names: ["Asha", "Ravi"], nextCursor: "after-ravi" };
const pages: Record<string, Page> = { "after-ravi": { names: ["Meera"], nextCursor: null } };

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe("useCursorPages", () => {
  it("asks for each page with the cursor the page before gave, and lists every page's items", async () => {
    const page = vi.fn((cursor: string | null) =>
      Promise.resolve((cursor === null ? undefined : pages[cursor]) ?? first),
    );
    const { result } = renderHook(
      () => useCursorPages({ queryKey: ["people"], page, items: (each: Page) => each.names }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.items).toEqual(["Asha", "Ravi"]);
    });
    expect(result.current.hasNextPage).toBe(true);
    await act(() => result.current.fetchNextPage());
    await waitFor(() => {
      expect(result.current.items).toEqual(["Asha", "Ravi", "Meera"]);
    });
    expect(page.mock.calls).toEqual([[null], ["after-ravi"]]);
    expect(result.current.hasNextPage).toBe(false);
  });
});
