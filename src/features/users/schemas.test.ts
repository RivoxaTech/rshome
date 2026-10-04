import { describe, expect, it } from "vitest";
import { createUserInputSchema, resetPasswordInputSchema, updateUserInputSchema } from "./schemas";

const valid = { name: "  Sana Ali ", email: "  Sana.Ali@Example.COM ", roleId: "3", isActive: "true", password: "temporary-1" };

describe("user schemas", () => {
  it("trims the name, lower-cases the email and coerces the role id and switch", () => {
    expect(createUserInputSchema.parse(valid)).toEqual({ name: "Sana Ali", email: "sana.ali@example.com", roleId: 3, isActive: true, password: "temporary-1" });
    expect(createUserInputSchema.parse({ ...valid, isActive: "false" }).isActive).toBe(false);
  });

  it("applies the change-password strength rule (at least 8 characters) to the temporary password", () => {
    const result = createUserInputSchema.safeParse({ ...valid, password: "short" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["password"]);
    expect(resetPasswordInputSchema.safeParse({ password: "1234567" }).success).toBe(false);
    expect(resetPasswordInputSchema.safeParse({ password: "12345678" }).success).toBe(true);
  });

  it("refuses a bad email or a missing role", () => {
    expect(createUserInputSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
    expect(createUserInputSchema.safeParse({ ...valid, roleId: "" }).success).toBe(false);
  });

  it("requires a version on update and takes no password there", () => {
    expect(updateUserInputSchema.safeParse({ name: "A B", email: "a@b.co", roleId: "1", isActive: "true" }).success).toBe(false);
    const parsed = updateUserInputSchema.parse({ name: "A B", email: "a@b.co", roleId: "1", isActive: "true", version: "1@x", password: "ignored" });
    expect(parsed).toEqual({ name: "A B", email: "a@b.co", roleId: 1, isActive: true, version: "1@x" });
  });
});
