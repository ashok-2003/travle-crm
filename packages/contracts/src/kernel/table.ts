// A list's numbered pages (bookings revamp, 2026-11-27): how many rows a page holds (25 unless the member picks 50 or
// 100), how far the pages go (the Leads list's limit), and which way a sort runs. Every table's input takes these.
import { z } from "zod";

export const TABLE_PAGE_SIZES = [25, 50, 100] as const;
export const tablePageSize = z.union([z.literal(25), z.literal(50), z.literal(100)]);
export type TablePageSize = z.infer<typeof tablePageSize>;

/** The furthest numbered page a table reads. */
export const MAX_TABLE_PAGE = 10_000;
export const tablePage = z.int().min(1).max(MAX_TABLE_PAGE);

export const sortDirection = z.enum(["asc", "desc"]);
export type SortDirection = z.infer<typeof sortDirection>;
