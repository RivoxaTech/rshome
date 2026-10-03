// @vitest-environment jsdom
/**
 * `BankDetails` is rendered on the storefront (checkout, order page) and, since S14, as the live
 * preview inside the panel's fixed-height shell. Its root must be `position: relative` so the copy
 * buttons' absolutely-positioned `sr-only` status spans anchor to it rather than the document root
 * — otherwise, inside the panel, they grow the document past the viewport and the whole page
 * scrolls (the D47 class of bug; found at 375px during the S14 walk-through).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BankDetails } from "./BankDetails";

afterEach(cleanup);

describe("BankDetails", () => {
  it("renders every account, shows the IBAN and note only when present, and keeps a positioned root", () => {
    const { container } = render(
      <BankDetails
        accounts={[
          { bankName: "Meezan Bank", accountTitle: "RS Home", accountNumber: "0123-4567890-1", iban: "PK36MEZN0001234567890123", note: "PKR transfers" },
          { bankName: "HBL", accountTitle: "RS Home", accountNumber: "555", iban: null, note: null },
        ]}
      />,
    );
    expect(container.firstElementChild).toHaveClass("relative");
    expect(screen.getByText("Meezan Bank")).toBeInTheDocument();
    expect(screen.getByText("HBL")).toBeInTheDocument();
    expect(screen.getByText("PK36MEZN0001234567890123")).toBeInTheDocument();
    expect(screen.getByText("PKR transfers")).toBeInTheDocument();
    expect(screen.getAllByText("IBAN")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /Copy account number/ })).toHaveLength(2);
  });
});
