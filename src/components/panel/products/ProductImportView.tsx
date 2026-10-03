"use client";

import { useRef, useState } from "react";
import { FormNotice } from "@/components/panel/FormField";
import type { ImportReport } from "@/features/catalog/csv-import-service";

type CheckResponse = { ok: true; report: ImportReport; token: string } | { ok: false; error: string };
type CommitResponse = { ok: true; created: number; updated: number } | { ok: false; error: string; report?: ImportReport };

/**
 * The two-step product CSV import (S18): "Check file" parses and validates everything server-side
 * and writes nothing; "Import N rows" only unlocks once the report has zero errors, and re-posts
 * the identical file alongside the check's token so the server can refuse a file that changed in
 * between. Two sibling actions, never a nested `<form>` (D49) — both post through `fetch` to their
 * own Route Handler rather than a native form submission, since the file can be up to 2MB (over a
 * Server Action's 1MB body cap).
 */
export function ProductImportView() {
  const [file, setFile] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    setReport(null);
    setToken(null);
    setError(null);
    setResult(null);
  }

  async function onCheck() {
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/panel/products/import/check", { method: "POST", body: formData });
      const data = (await response.json()) as CheckResponse;
      if (!data.ok) {
        setError(data.error);
        setReport(null);
        setToken(null);
        return;
      }
      setReport(data.report);
      setToken(data.token);
    } catch {
      setError("Something went wrong checking the file. Try again.");
    } finally {
      setChecking(false);
    }
  }

  async function onImport() {
    if (!file || !token) return;
    setCommitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("token", token);
      formData.set("fileName", file.name);
      const response = await fetch("/api/panel/products/import/commit", { method: "POST", body: formData });
      const data = (await response.json()) as CommitResponse;
      if (!data.ok) {
        setError(data.error);
        if (data.report) setReport(data.report);
        return;
      }
      setResult({ created: data.created, updated: data.updated });
      setReport(null);
      setToken(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setError("Something went wrong importing the file. Try again.");
    } finally {
      setCommitting(false);
    }
  }

  const canImport = report !== null && report.rowErrors.length === 0 && token !== null;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="border-input rounded-lg border p-4 text-sm">
        <p className="mb-2">
          Download the template for the exact column order, then add rows — one per variant, repeating the product&apos;s own columns on every row
          that belongs to it.
        </p>
        <a href="/api/panel/products/import/template" className="text-primary font-medium underline underline-offset-2">
          Download template (CSV)
        </a>
      </div>

      <div className="flex flex-col gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFileChange}
          className="text-sm"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCheck}
            disabled={!file || checking}
            className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium"
          >
            {checking ? "Checking…" : "Check file"}
          </button>
          <button
            type="button"
            onClick={onImport}
            disabled={!canImport || committing}
            className="border-input hover:bg-secondary disabled:opacity-50 rounded-lg border px-4 py-2 text-sm font-medium"
          >
            {committing ? "Importing…" : report ? `Import ${report.toCreateProducts + report.toUpdateProducts} product(s)` : "Import N rows"}
          </button>
        </div>
      </div>

      {error && <FormNotice tone="error">{error}</FormNotice>}
      {result && (
        <FormNotice tone="success">
          Imported: {result.created} product(s) created, {result.updated} updated.
        </FormNotice>
      )}

      {report && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            <Stat label="Rows read" value={report.totalRows} />
            <Stat label="Products to create" value={report.toCreateProducts} />
            <Stat label="Products to update" value={report.toUpdateProducts} />
            <Stat label="Variants to create" value={report.toCreateVariants} />
            <Stat label="Variants to update" value={report.toUpdateVariants} />
          </div>

          {report.rowErrors.length === 0 && report.rowWarnings.length === 0 && (
            <FormNotice tone="success">No problems found. Ready to import.</FormNotice>
          )}

          {(report.rowErrors.length > 0 || report.rowWarnings.length > 0) && (
            <div className="border-input overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Column</th>
                    <th className="px-3 py-2 font-medium">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rowErrors.map((issue, index) => (
                    <tr key={`error-${index}`} className="border-destructive/20 text-destructive border-t">
                      <td className="px-3 py-2">{issue.row}</td>
                      <td className="px-3 py-2">{issue.column}</td>
                      <td className="px-3 py-2">{issue.message}</td>
                    </tr>
                  ))}
                  {report.rowWarnings.map((issue, index) => (
                    <tr key={`warning-${index}`} className="border-input border-t">
                      <td className="px-3 py-2">{issue.row}</td>
                      <td className="px-3 py-2">{issue.column}</td>
                      <td className="px-3 py-2">{issue.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-input rounded-lg border p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
