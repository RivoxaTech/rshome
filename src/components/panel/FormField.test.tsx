// @vitest-environment jsdom
/**
 * S22 QA-02: a field error is announced (`role="alert"`) and tied to its control
 * (`aria-describedby`, `aria-invalid`); a FormNotice error is an alert, a success is a status.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Field, FormNotice } from "./FormField";

afterEach(cleanup);

describe("Field", () => {
  it("announces the error and points the control at it", () => {
    render(
      <Field id="email" label="Email" error="Enter a valid email.">
        <input id="email" name="email" />
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email.");
    expect(screen.getByRole("alert")).toHaveAttribute("id", "email-error");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "email-error");
  });

  it("describes the control by its hint when there is no error, and marks nothing invalid", () => {
    render(
      <Field id="slug" label="Slug" hint="Lowercase letters and dashes.">
        <input id="slug" name="slug" />
      </Field>,
    );
    const input = screen.getByLabelText("Slug");
    expect(input).toHaveAttribute("aria-describedby", "slug-hint");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("leaves a composite child alone", () => {
    render(
      <Field id="wrapped" label="Wrapped" error="Nope">
        <div data-testid="wrapper">
          <input id="wrapped" />
        </div>
      </Field>,
    );
    expect(screen.getByTestId("wrapper")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("alert")).toHaveTextContent("Nope");
  });
});

describe("FormNotice", () => {
  it("is an alert for an error and a status for a success", () => {
    render(
      <>
        <FormNotice tone="error">Could not save.</FormNotice>
        <FormNotice tone="success">Saved.</FormNotice>
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save.");
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
  });
});
