import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the correct password", async () => {
    const encoded = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", encoded)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const encoded = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("wrong password", encoded)).resolves.toBe(false);
  });

  it("produces a different salt (and hash) for the same password", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
  });

  it("rejects a malformed encoded hash instead of throwing", async () => {
    await expect(verifyPassword("anything", "not-a-valid-hash")).resolves.toBe(false);
  });
});
