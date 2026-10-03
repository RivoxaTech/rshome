import { describe, expect, it } from "vitest";
import { parseCsv } from "./parser";

describe("parseCsv", () => {
  it("parses plain comma-separated rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("strips a leading UTF-8 BOM", () => {
    expect(parseCsv("﻿a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles bare LF line endings", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("does not add a trailing empty row for a final newline", () => {
    expect(parseCsv("a,b\n1,2\n").length).toBe(2);
    expect(parseCsv("a,b\r\n1,2\r\n").length).toBe(2);
  });

  it("parses a quoted field containing a comma", () => {
    expect(parseCsv('a,"1,2",c')).toEqual([["a", "1,2", "c"]]);
  });

  it("parses a quoted field containing a newline", () => {
    expect(parseCsv('a,"line one\nline two",c')).toEqual([["a", "line one\nline two", "c"]]);
  });

  it("parses a quoted field containing a CRLF", () => {
    expect(parseCsv('a,"line one\r\nline two",c')).toEqual([["a", "line one\r\nline two", "c"]]);
  });

  it("unescapes a doubled quote inside a quoted field", () => {
    expect(parseCsv('"12"" plates"')).toEqual([['12" plates']]);
  });

  it("handles empty fields", () => {
    expect(parseCsv("a,,c")).toEqual([["a", "", "c"]]);
    expect(parseCsv(",,")).toEqual([["", "", ""]]);
  });

  it("returns a ragged row as-is, without throwing", () => {
    expect(parseCsv("a,b,c\n1,2")).toEqual([
      ["a", "b", "c"],
      ["1", "2"],
    ]);
  });

  it("handles a 10,000-character cell", () => {
    const long = "x".repeat(10_000);
    expect(parseCsv(`a,${long}`)).toEqual([["a", long]]);
  });

  it("returns no rows for an empty file", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("round-trips through the writer for a value needing quoting", () => {
    expect(parseCsv('"=SUM(A1:A2), with a comma"')).toEqual([["=SUM(A1:A2), with a comma"]]);
  });
});
