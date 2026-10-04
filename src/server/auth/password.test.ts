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

  // S22 SEC-09: a tampered row must never verify, however it is shaped.
  it("rejects a hash whose key part is empty, instead of comparing two empty buffers as equal", async () => {
    const encoded = await hashPassword("secret");
    const [prefix, n, r, p, salt] = encoded.split(":");
    await expect(verifyPassword("secret", `${prefix}:${n}:${r}:${p}:${salt}:`)).resolves.toBe(false);
    await expect(verifyPassword("anything", `${prefix}:${n}:${r}:${p}:${salt}:`)).resolves.toBe(false);
  });

  it("rejects a key or salt of the wrong length and parameters outside the allowed ranges", async () => {
    const encoded = await hashPassword("secret");
    const [prefix, n, r, p, salt, hash] = encoded.split(":");
    await expect(verifyPassword("secret", `${prefix}:${n}:${r}:${p}:${salt}:${hash.slice(0, 32)}`)).resolves.toBe(false);
    await expect(verifyPassword("secret", `${prefix}:${n}:${r}:${p}:${salt.slice(0, 8)}:${hash}`)).resolves.toBe(false);
    await expect(verifyPassword("secret", `${prefix}:2:${r}:${p}:${salt}:${hash}`)).resolves.toBe(false);
    await expect(verifyPassword("secret", `${prefix}:1000:${r}:${p}:${salt}:${hash}`)).resolves.toBe(false);
    await expect(verifyPassword("secret", `${prefix}:${n}:0:${p}:${salt}:${hash}`)).resolves.toBe(false);
    await expect(verifyPassword("secret", `${prefix}:${n}:${r}:99:${salt}:${hash}`)).resolves.toBe(false);
    await expect(verifyPassword("secret", `${prefix}:${n}:${r}:${p}:zz${salt.slice(2)}:${hash}`)).resolves.toBe(false);
    // The genuine hash still verifies after all those guards.
    await expect(verifyPassword("secret", encoded)).resolves.toBe(true);
  });
});
