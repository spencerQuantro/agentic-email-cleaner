import { describe, expect, it, vi } from "vitest";
import { checkHost, checkUrl, isBlockedAddress } from "./safe-url";

describe("checkUrl", () => {
  it("accepts plain https URLs and normalises :443", () => {
    const res = checkUrl("https://unsub.example:443/x?y=1");
    expect(res.ok && res.url.href).toBe("https://unsub.example/x?y=1");
  });

  it.each([
    ["not a url", "Unsubscribe URL is invalid"],
    ["", "Unsubscribe URL is invalid"],
    ["http://unsub.example/", "Unsubscribe URL is not HTTPS"],
    ["ftp://unsub.example/", "Unsubscribe URL is not HTTPS"],
    ["https://user:pass@unsub.example/", "Unsubscribe URL must not contain credentials"],
    ["https://user@unsub.example/", "Unsubscribe URL must not contain credentials"],
    ["https://unsub.example:8443/", "Unsubscribe URL uses a non-standard port"],
    ["https://unsub.example:80/", "Unsubscribe URL uses a non-standard port"],
  ])("refuses %j", (input, reason) => {
    expect(checkUrl(input)).toEqual({ ok: false, reason });
  });
});

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "127.255.255.254",
    "0.0.0.0",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "100.127.255.255",
    "224.0.0.1",
    "239.255.255.255",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fe80::1",
    "febf::1",
    "fc00::1",
    "fd12::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:a00:5",
    "::ffff:169.254.169.254",
    "0:0:0:0:0:ffff:7f00:1",
    "garbage",
    "",
    "[::1]",
  ])("blocks %j", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(["172.32.0.1", "100.128.0.1", "93.184.216.34", "2606:4700::1111", "::ffff:5db8:d822"])(
    "allows %j",
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    },
  );
});

describe("checkHost", () => {
  it("checks IP literals directly without resolving", async () => {
    const lookup = vi.fn();
    expect(await checkHost("[::1]", lookup)).toMatchObject({ ok: false });
    expect(await checkHost("10.0.0.5", lookup)).toMatchObject({ ok: false });
    expect(await checkHost("93.184.216.34", lookup)).toEqual({ ok: true });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("refuses when any resolved address is blocked", async () => {
    const lookup = vi.fn(async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "fd00::1", family: 6 },
    ]);
    expect(await checkHost("unsub.example", lookup)).toEqual({
      ok: false,
      reason: "Unsubscribe URL points to a private or internal address",
    });
    expect(lookup).toHaveBeenCalledWith("unsub.example");
  });

  it("refuses when the lookup fails or returns nothing", async () => {
    const reason = "Could not resolve unsubscribe host";
    expect(await checkHost("a.example", async () => [])).toEqual({ ok: false, reason });
    expect(
      await checkHost("a.example", async () => {
        throw new Error("ENOTFOUND");
      }),
    ).toEqual({ ok: false, reason });
  });

  it("allows hosts that resolve only to public addresses", async () => {
    const lookup = async () => [{ address: "2606:4700::1111", family: 6 }];
    expect(await checkHost("unsub.example", lookup)).toEqual({ ok: true });
  });
});
