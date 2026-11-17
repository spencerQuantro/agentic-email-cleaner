import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";

describe("token encryption", () => {
  const key = randomBytes(32).toString("base64");

  it("round-trips", () => {
    const sealed = encrypt("refresh-token-123", key);
    expect(sealed).not.toContain("refresh-token-123");
    expect(decrypt(sealed, key)).toBe("refresh-token-123");
  });

  it("rejects tampered ciphertext", () => {
    const sealed = Buffer.from(encrypt("secret", key), "base64");
    sealed[sealed.length - 1]! ^= 1;
    expect(() => decrypt(sealed.toString("base64"), key)).toThrow();
  });

  it("rejects keys of the wrong length", () => {
    expect(() => encrypt("x", Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
