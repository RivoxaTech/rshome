/**
 * The panel's wholesale inbox (REQUIREMENTS SF-08/AD-05, S17): the tab counts, one page of
 * inquiries, and an inquiry's detail, every date already formatted (CLAUDE.md #5) and the status
 * control filtered by the viewer's permissions. The Server Components check `wholesale.view` first.
 */
import { cache } from "react";
import { siteConfig } from "@/config/site.config";
import { PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { getStoreIdentity } from "@/features/settings/service";
import { formatPhone } from "@/lib/phone";
import { buildWholesaleCsv, type WholesaleCsvRow } from "./csv";
import {
  countInquiriesByStatus,
  countItemsByInquiryIds,
  getInquiryById,
  getItemsByInquiryId,
  getItemsByInquiryIds,
  listInquiries,
  listInquiriesForExport,
  listNotes,
  listStatusHistory,
} from "./staff-repo";
import { DEFAULT_PAGE_SIZE, STATUS_LABELS, WHOLESALE_STATUSES, canChangeStatus, type WholesaleStatus } from "./transitions";

const zoned = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: siteConfig.timezone, ...options });
const dateTime = zoned({ day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dateOnly = zoned({ day: "numeric", month: "short", year: "numeric" });

function businessTypeLabel(value: string): string {
  return siteConfig.wholesaleBusinessTypes.find((option) => option.value === value)?.label ?? value;
}

// ── Counts ──────────────────────────────────────────────────────────────────────────────────

export type StatusCounts = Record<WholesaleStatus | "all", number>;

/** Once per request: the layout and the list page share it. */
export const getWholesaleInquiryCounts = cache(async (): Promise<StatusCounts> => {
  const byStatus = await countInquiriesByStatus();
  const all = Object.values(byStatus).reduce((sum, value) => sum + value, 0);
  return { ...byStatus, all };
});

/** The sidebar's nav-item count (`nav-items.ts` key `wholesale`): `{}` without `wholesale.view`. */
export async function getWholesaleCountsForPermissions(permissions: ReadonlySet<PermissionKey>): Promise<Partial<Record<string, number>>> {
  if (!permissions.has(PERMISSIONS.WHOLESALE_VIEW)) return {};
  const counts = await getWholesaleInquiryCounts();
  return { wholesale: counts.new };
}

// ── What the status pill can do ─────────────────────────────────────────────────────────────

function inquiryControl(status: WholesaleStatus, permissions: ReadonlySet<PermissionKey>) {
  const canManage = permissions.has(PERMISSIONS.WHOLESALE_MANAGE);
  return {
    status,
    statusLabel: STATUS_LABELS[status],
    canManage,
    options: canManage ? WHOLESALE_STATUSES.filter((candidate) => canChangeStatus(status, candidate)) : [],
  };
}

export type InquiryControl = ReturnType<typeof inquiryControl>;

// ── The list ────────────────────────────────────────────────────────────────────────────────

export async function listStaffWholesaleInquiries(
  tab: WholesaleStatus | "all",
  query: { q?: string; page: number; pageSize?: number },
  permissions: ReadonlySet<PermissionKey>,
) {
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const offset = (query.page - 1) * pageSize;
  const { rows, total } = await listInquiries(tab, query.q, { limit: pageSize, offset });
  const itemCounts = await countItemsByInquiryIds(rows.map((row) => row.id));
  const items = rows.map((row, index) => ({
    serial: offset + index + 1,
    id: row.id,
    placedDate: dateOnly.format(row.createdAt),
    name: row.name,
    business: row.business,
    city: row.city,
    itemCount: itemCounts.get(row.id) ?? 0,
    control: inquiryControl(row.status, permissions),
  }));
  return { items, total, page: query.page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export type StaffWholesaleListItem = Awaited<ReturnType<typeof listStaffWholesaleInquiries>>["items"][number];

// ── The detail page ─────────────────────────────────────────────────────────────────────────

/** A status recorded on an audit-log row's JSON `{status: "..."}` value, or undefined if unreadable. */
function parsedStatus(json: string | null): WholesaleStatus | undefined {
  if (!json) return undefined;
  try {
    const value = (JSON.parse(json) as { status?: unknown }).status;
    return (WHOLESALE_STATUSES as readonly string[]).includes(value as string) ? (value as WholesaleStatus) : undefined;
  } catch {
    return undefined;
  }
}

type ActivityRow = { id: string; kind: "status" | "note"; at: string; by: string; from: string | null; to: string | null; note: string | null };

async function getActivity(inquiryId: number): Promise<ActivityRow[]> {
  const [notes, statusHistory] = await Promise.all([listNotes(inquiryId), listStatusHistory(inquiryId)]);

  const rows = [
    ...notes.map((row) => ({
      id: `note-${row.id}`,
      kind: "note" as const,
      createdAt: row.createdAt,
      by: row.authorName ?? "Staff",
      from: null as WholesaleStatus | null,
      to: null as WholesaleStatus | null,
      note: row.note as string | null,
    })),
    ...statusHistory.map((row) => ({
      id: `status-${row.id}`,
      kind: "status" as const,
      createdAt: row.createdAt,
      by: row.authorName ?? "Staff",
      from: parsedStatus(row.oldValues) ?? null,
      to: parsedStatus(row.newValues) ?? null,
      note: null as string | null,
    })),
  ];
  // Sorted on the raw `Date` before formatting — the formatted strings below aren't chronologically comparable.
  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    at: dateTime.format(row.createdAt),
    by: row.by,
    from: row.from ? STATUS_LABELS[row.from] : null,
    to: row.to ? STATUS_LABELS[row.to] : null,
    note: row.note,
  }));
}

export async function getStaffWholesaleInquiry(id: number, permissions: ReadonlySet<PermissionKey>) {
  const inquiry = await getInquiryById(id);
  if (!inquiry) return null;
  const [items, activity] = await Promise.all([getItemsByInquiryId(id), getActivity(id)]);
  const control = inquiryControl(inquiry.status, permissions);

  return {
    id: inquiry.id,
    name: inquiry.name,
    business: inquiry.business,
    businessType: inquiry.businessType,
    businessTypeLabel: businessTypeLabel(inquiry.businessType),
    city: inquiry.city,
    neededByDate: inquiry.neededByDate ? dateOnly.format(inquiry.neededByDate) : null,
    message: inquiry.message || null,
    placedAt: dateTime.format(inquiry.createdAt),
    status: inquiry.status,
    control,
    customer: { name: inquiry.name, phone: formatPhone(inquiry.phone), phoneDigits: inquiry.phone, email: inquiry.email },
    whatsApp: { message: `Hello ${inquiry.name}, this is ${(await getStoreIdentity()).storeName} about your wholesale inquiry.` },
    items: items.map((item) => ({ id: item.id, itemName: item.itemName, quantity: item.quantity, note: item.note })),
    activity,
    canAddNote: control.canManage,
  };
}

export type StaffWholesaleInquiryView = NonNullable<Awaited<ReturnType<typeof getStaffWholesaleInquiry>>>;

// ── CSV export ──────────────────────────────────────────────────────────────────────────────

/** The current filter's matching rows (cap 5,000), one row per inquiry, items joined into one cell. */
export async function buildWholesaleExport(tab: WholesaleStatus | "all", search: string | undefined): Promise<{ csv: string; rowCount: number; truncated: boolean }> {
  const { rows, truncated } = await listInquiriesForExport(tab, search);
  const items = await getItemsByInquiryIds(rows.map((row) => row.id));
  const itemsByInquiry = new Map<number, typeof items>();
  for (const item of items) {
    const list = itemsByInquiry.get(item.inquiryId) ?? [];
    list.push(item);
    itemsByInquiry.set(item.inquiryId, list);
  }

  const csvRows: WholesaleCsvRow[] = rows.map((row) => ({
    id: row.id,
    createdAt: dateOnly.format(row.createdAt),
    name: row.name,
    business: row.business ?? "",
    businessType: businessTypeLabel(row.businessType),
    phone: formatPhone(row.phone),
    email: row.email ?? "",
    city: row.city,
    neededByDate: row.neededByDate ? dateOnly.format(row.neededByDate) : "",
    status: STATUS_LABELS[row.status],
    items: (itemsByInquiry.get(row.id) ?? [])
      .map((item) => `${item.quantity}x ${item.itemName}${item.note ? ` (${item.note})` : ""}`)
      .join("; "),
    message: row.message,
  }));
  return { csv: buildWholesaleCsv(csvRows), rowCount: rows.length, truncated };
}
