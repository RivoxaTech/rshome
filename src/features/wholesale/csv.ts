/**
 * The wholesale inquiries CSV export (S17): pure and unit-tested. UTF-8 with a leading BOM (Excel
 * needs it to read accents correctly), CRLF row endings, and spreadsheet formula injection
 * defeated by prefixing a value that starts with `=`, `+`, `-`, `@` or a tab with an apostrophe.
 */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t"];

export function escapeCsvField(value: string): string {
  let field = FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix)) ? `'${value}` : value;
  if (/[",\r\n]/.test(field)) field = `"${field.replace(/"/g, '""')}"`;
  return field;
}

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

function toRow(values: readonly string[]): string {
  return values.map(escapeCsvField).join(",");
}

export function buildWholesaleCsv(rows: WholesaleCsvRow[]): string {
  const lines = [toRow(HEADERS)];
  for (const row of rows) {
    lines.push(
      toRow([
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
      ]),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
