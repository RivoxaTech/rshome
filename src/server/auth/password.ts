import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

/**
 * The parameter ranges a stored hash may carry (S22 SEC-09): the current defaults and the room to
 * raise them later, nothing that could make scrypt trivially cheap or blow the memory limit. A hash
 * outside these ranges, or with a key or salt of the wrong length, never verifies.
 */
const SCRYPT_LIMITS = { minN: 2 ** 12, maxN: 2 ** 18, maxR: 32, maxP: 16 } as const;

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

/** Encodes as `scrypt:N:r:p:saltHex:hashHex` so params can change without breaking old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_PARAMS);
  const { N, r, p } = SCRYPT_PARAMS;
  return `scrypt:${N}:${r}:${p}:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

/** False for a wrong password and for any encoded hash that isn't exactly the shape `hashPassword` writes. */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!isPowerOfTwo(N) || N < SCRYPT_LIMITS.minN || N > SCRYPT_LIMITS.maxN) return false;
  if (!Number.isInteger(r) || r < 1 || r > SCRYPT_LIMITS.maxR) return false;
  if (!Number.isInteger(p) || p < 1 || p > SCRYPT_LIMITS.maxP) return false;
  if (!/^[0-9a-f]+$/.test(saltHex) || !/^[0-9a-f]+$/.test(hashHex)) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) return false;
  try {
    const derivedKey = await scryptAsync(password, salt, KEY_LENGTH, { N, r, p });
    return timingSafeEqual(derivedKey, expected);
  } catch {
    // Parameters the runtime refuses (e.g. over its memory limit) are a bad hash, not a crash.
    return false;
  }
}
