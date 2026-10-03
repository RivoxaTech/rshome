/**
 * The wholesale inquiries CSV export (S17): pure and unit-tested. Row/column formatting here;
 * the BOM/CRLF/quoting/formula-injection rules live once in `features/csv/writer.ts` (S18),
 * shared with the product and order CSV exports.
 */
import { buildCsv, escapeCsvField } from "@/features/csv/writer";

export { escapeCsvField };

export type WholesaleCsvRow = {
  id: number;
  createdAt: string;
  name: string;
  business: string;
  businessType: string;
  phone: string;
  email: string;
  city: string;
  neededByDate: string;
  status: string;
  items: string;
  message: string;
};

const HEADERS = ["ID", "Date", "Name", "Business", "Business type", "Phone", "Email", "City", "Needed by", "Status", "Items", "Message"];

function toValues(row: WholesaleCsvRow): string[] {
  return [
    String(row.id),
    row.createdAt,
    row.name,
    row.business,
    row.businessType,
    row.phone,
    row.email,
    row.city,
    row.neededByDate,
    row.status,
    row.items,
    row.message,
  ];
}

export function buildWholesaleCsv(rows: WholesaleCsvRow[]): string {
  return buildCsv(HEADERS, rows.map(toValues));
}
