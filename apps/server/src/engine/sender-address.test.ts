import { describe, expect, it } from "vitest";
import { isValidSenderAddress, parseFrom, sentMailQuery } from "./sender-address";

const invalidFroms = [
  "a@b.com OR in:sent",
  '"x" <a@b.com OR in:sent>',
  "a@b.com} {in:sent",
  "a b@c.com",
];

describe("parseFrom", () => {
  it("parses a named address into a valid address", () => {
    const { address } = parseFrom("Name <a@b.com>");
    expect(address).toBe("a@b.com");
    expect(isValidSenderAddress(address)).toBe(true);
  });

  it("parses a bare address into a valid address", () => {
    const { address } = parseFrom("a@b.com");
    expect(address).toBe("a@b.com");
    expect(isValidSenderAddress(address)).toBe(true);
  });
});

describe("isValidSenderAddress", () => {
  it.each(invalidFroms)("rejects the address parsed from %s", (from) => {
    expect(isValidSenderAddress(parseFrom(from).address)).toBe(false);
  });
});

describe("sentMailQuery", () => {
  it("quotes a valid address", () => {
    expect(sentMailQuery("a@b.com")).toBe('in:sent to:"a@b.com"');
  });

  it.each(invalidFroms)("returns undefined for the address parsed from %s", (from) => {
    expect(sentMailQuery(parseFrom(from).address)).toBeUndefined();
  });
});
