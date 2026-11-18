import { describe, expect, it } from "vitest";
import { normalizeSender } from "./senders";

const existing = ["mom@gmail.com", "yourcompany.com"];

describe("normalizeSender", () => {
  it("accepts email addresses and domains, trimmed and lowercased", () => {
    expect(normalizeSender("dad@gmail.com", existing)).toEqual({
      ok: true,
      value: "dad@gmail.com",
    });
    expect(normalizeSender("mom@gmail.com", [])).toEqual({ ok: true, value: "mom@gmail.com" });
    expect(normalizeSender(" Delta.COM ", existing)).toEqual({ ok: true, value: "delta.com" });
    expect(normalizeSender("a-b.example.org", existing)).toEqual({
      ok: true,
      value: "a-b.example.org",
    });
  });

  it.each(["", "delta", "@x.com", "foo@", "has space.com"])("rejects %j", (input) => {
    expect(normalizeSender(input, existing)).toEqual({
      ok: false,
      error: "Enter an email address or a domain, like name@example.com or example.com.",
    });
  });

  it("rejects existing entries", () => {
    expect(normalizeSender("Mom@Gmail.com", existing)).toEqual({
      ok: false,
      error: "mom@gmail.com is already protected.",
    });
    expect(normalizeSender("yourcompany.com", existing)).toEqual({
      ok: false,
      error: "yourcompany.com is already protected.",
    });
  });
});
