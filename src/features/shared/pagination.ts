/**
 * Panel list pagination (S22 QA-09): every list offers the same rows-per-page choices, reads
 * `pageSize` from the URL the same way and counts pages the same way, so they live here once.
 */
import "@/lib/zod-config";
import { z } from "zod";

/** Rows per page, chosen by the viewer; carried in the URL like the tab and search. */
export const PAGE_SIZE_OPTIONS = [25, 50, 75, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 25;

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

/** The `pageSize` query field: one of the options, else the default (a repeated key takes its first value). */
export const pageSizeField = z
  .preprocess(firstValue, z.coerce.number().int())
  .refine((value): value is PageSize => (PAGE_SIZE_OPTIONS as readonly number[]).includes(value))
  .catch(DEFAULT_PAGE_SIZE);

/** At least one page, even for an empty list (the past-the-end redirect relies on it). */
export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
