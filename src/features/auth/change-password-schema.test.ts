import { describe, expect, it } from "vitest";
import { ChangePasswordInputSchema } from "./service";

const valid = { currentPassword: "old-password", newPassword: "new-password-1", confirmPassword: "new-password-1" };

describe("ChangePasswordInputSchema", () => {
  it("accepts a valid change", () => {
    expect(ChangePasswordInputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a new password under 8 characters", () => {
    const result = ChangePasswordInputSchema.safeParse({ ...valid, newPassword: "short1", confirmPassword: "short1" });
    expect(result.success).toBe(false);
  });

  it("rejects a new password that matches the current one", () => {
    const result = ChangePasswordInputSchema.safeParse({
      currentPassword: "same-password",
      newPassword: "same-password",
      confirmPassword: "same-password",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "newPassword")).toBe(true);
    }
  });

  it("rejects a confirmation that doesn't match", () => {
    const result = ChangePasswordInputSchema.safeParse({ ...valid, confirmPassword: "something-else" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "confirmPassword")).toBe(true);
    }
  });

  it("rejects an empty current password", () => {
    expect(ChangePasswordInputSchema.safeParse({ ...valid, currentPassword: "" }).success).toBe(false);
  });
});
