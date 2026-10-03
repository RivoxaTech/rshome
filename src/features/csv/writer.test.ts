import { describe, expect, it } from "vitest";
import { buildCsv, escapeCsvField } from "./writer";

describe("escapeCsvField", () => {
  it("leaves an ordinary value untouched", () => {
    expect(escapeCsvField("Ayesha Raza")).toBe("Ayesha Raza");
  });

  it("quotes a field containing a comma", () => {
    expect(escapeCsvField("Karachi, Pakistan")).toBe('"Karachi, Pakistan"');
  });

  it("doubles embedded quotes", () => {
    expect(escapeCsvField('12" plates')).toBe('"12"" plates"');
  });

  it("quotes a field containing a newline", () => {
    expect(escapeCsvField("line one\nline two")).toBe('"line one\nline two"');
  });

  it("quotes a field containing a carriage return", () => {
    expect(escapeCsvField("line one\rline two")).toBe('"line one\rline two"');
  });

  it("prefixes every formula-injection character with an apostrophe", () => {
    expect(escapeCsvField("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(escapeCsvField("+1234")).toBe("'+1234");
    expect(escapeCsvField("-1234")).toBe("'-1234");
    expect(escapeCsvField("@mention")).toBe("'@mention");
    expect(escapeCsvField("\tindented")).toBe("'\tindented");
  });

  it("re-quotes a formula-prefixed value that also needs quoting", () => {
    expect(escapeCsvField("=A1,A2")).toBe('"\'=A1,A2"');
  });
});

describe("buildCsv", () => {
  it("starts with a UTF-8 BOM and the header row", () => {
    const csv = buildCsv(["A", "B"], []);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("A,B");
  });

  it("joins rows with CRLF and ends with a trailing CRLF", () => {
    const csv = buildCsv(["A", "B"], [["1", "2"], ["3", "4"]]);
    expect(csv).toBe("﻿A,B\r\n1,2\r\n3,4\r\n");
  });

  it("neutralises a formula-looking cell in a data row", () => {
    const csv = buildCsv(["Name"], [["=HYPERLINK(\"http://evil\")"]]);
    expect(csv).toContain("'=HYPERLINK");
  });

  it("handles an empty field", () => {
    const csv = buildCsv(["A", "B"], [["", "x"]]);
    expect(csv).toBe("﻿A,B\r\n,x\r\n");
  });

  it("handles a very long cell", () => {
    const long = "x".repeat(10_000);
    const csv = buildCsv(["A"], [[long]]);
    expect(csv).toContain(long);
  });
});
