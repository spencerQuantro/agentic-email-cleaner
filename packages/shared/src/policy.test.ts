import { describe, expect, it } from "vitest";
import { defaultRules } from "./fixtures";
import { decide } from "./policy";
import type { SenderClassification } from "./schemas";

const base: SenderClassification = {
  action: "unsubscribe",
  confidence: 99,
  reason: "Promotions only",
  signals: [],
  categories: [],
};

describe("decide", () => {
  it("auto-acts at or above the threshold", () => {
    expect(
      decide({ senderAddress: "deals@shop.com", classification: base, rules: defaultRules }),
    ).toEqual({ kind: "auto", action: "unsubscribe" });

    expect(
      decide({
        senderAddress: "deals@shop.com",
        classification: { ...base, confidence: defaultRules.threshold },
        rules: defaultRules,
      }).kind,
    ).toBe("auto");
  });

  it("sends anything below the threshold to review", () => {
    expect(
      decide({
        senderAddress: "deals@shop.com",
        classification: { ...base, confidence: 62 },
        rules: defaultRules,
      }),
    ).toEqual({ kind: "review", action: "unsubscribe" });
  });

  it("sends confident actions to review when that auto-action is switched off", () => {
    expect(
      decide({
        senderAddress: "deals@shop.com",
        classification: { ...base, action: "delete" },
        rules: { ...defaultRules, autoDelete: false },
      }).kind,
    ).toBe("review");
  });

  it("never touches protected categories, however confident", () => {
    expect(
      decide({
        senderAddress: "orders@shop.com",
        classification: { ...base, categories: ["receipts"] },
        rules: defaultRules,
      }).kind,
    ).toBe("protected");
  });

  it("matches protected senders by exact address, domain, or subdomain", () => {
    const rules = { ...defaultRules, protectedSenders: ["mom@gmail.com", "delta.com"] };
    const at = (senderAddress: string) =>
      decide({ senderAddress, classification: base, rules }).kind;

    expect(at("Mom@Gmail.com")).toBe("protected");
    expect(at("news@delta.com")).toBe("protected");
    expect(at("news@e.delta.com")).toBe("protected");
    expect(at("someone@gmail.com")).toBe("auto");
    expect(at("news@notdelta.com")).toBe("auto");
  });

  it("respects a keep classification", () => {
    expect(
      decide({
        senderAddress: "friend@example.com",
        classification: { ...base, action: "keep" },
        rules: defaultRules,
      }),
    ).toEqual({ kind: "keep" });
  });
});
