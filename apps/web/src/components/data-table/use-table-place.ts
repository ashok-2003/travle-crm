"use client";

// Where a table is in its list (bookings revamp, 2026-11-27), read from and written to the address: the range a page
// shows, another list (a chip, a filter, a sort: its first page, at the same size), another page or size (a step in the
// history, so Back and Forward walk them; a new size opens on the page holding the first row shown), and a page past the
// last (a kept link; its rows gone) moving to the last once the list has answered.
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { pageRange } from "@/components/table-pagination";

interface Place {
  page: number;
  limit: number;
}

export function useTablePlace<Address extends Place>(
  address: Address,
  href: (address: Partial<Address>) => string,
  sizes: readonly Address["limit"][],
  list: { total: number; settled: boolean },
) {
  const router = useRouter();
  const range = pageRange(address.page, address.limit, list.total);
  const pastTheEnd = list.settled && list.total > 0 && address.page > range.pages;
  const lastPage = href({ ...address, page: range.pages });
  useEffect(() => {
    if (pastTheEnd) router.replace(lastPage);
  }, [pastTheEnd, lastPage, router]);
  const go = (page: number, limit: number = address.limit) => {
    const size = sizes.find((one) => one === limit) ?? address.limit;
    router.push(href({ ...address, page, limit: size }));
  };
  return {
    range,
    /** Another list: its first page, at the same size. */
    show: (next: Address) => {
      router.replace(href({ ...next, page: 1 }));
    },
    /** Another page of this list. */
    go,
    /** Another size: the page that holds the first row shown. */
    resize: (size: number) => {
      go(Math.floor(Math.max(range.from - 1, 0) / size) + 1, size);
    },
  };
}
