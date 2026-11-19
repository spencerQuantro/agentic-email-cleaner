import { afterEach, describe, expect, it, vi } from "vitest";
import type { PinnedRequestInit } from "../lib/pinned-request";
import type { PinnedAddress } from "../lib/safe-url";
import { oneClickUnsubscribe, type UnsubscribeResult } from "./mail";

const PUBLIC = [{ address: "93.184.216.34", family: 4 }];

/** Maps hostnames to addresses; unknown hosts resolve to a public address. */
function fakeLookup(table: Record<string, { address: string; family: number }[]> = {}) {
  return vi.fn(async (host: string) => table[host] ?? PUBLIC);
}

type Reply = { status: number; location: string | null; body?: string };

/** Returns the given replies in order. */
function fakeRequest(...replies: Reply[]) {
  const fn = vi.fn(async (_url: URL, _address: PinnedAddress, _init: PinnedRequestInit) => {
    const next = replies.shift();
    if (!next) throw new Error("unexpected request");
    return next;
  });
  return fn;
}

const ok = (): Reply => ({ status: 200, location: null, body: "ok" });
const redirect = (status: number, location?: string): Reply => ({
  status,
  location: location ?? null,
});

const reasons: string[] = [];
function track(res: UnsubscribeResult) {
  if (!res.ok) reasons.push(res.reason);
  return res;
}

afterEach(() => {
  for (const reason of reasons) {
    expect(reason).not.toContain("secret-internal-detail");
    expect(reason).not.toMatch(/\d+\.\d+\.\d+\.\d+|[0-9a-f]*::[0-9a-f]*/i);
  }
  reasons.length = 0;
});

describe("oneClickUnsubscribe", () => {
  it.each([
    "https://127.0.0.1/",
    "https://[::1]/",
    "https://169.254.169.254/",
    "https://10.0.0.5/",
    "https://[::ffff:127.0.0.1]/",
  ])("refuses the IP literal %s without resolving or requesting", async (url) => {
    const request = fakeRequest(ok());
    const lookup = fakeLookup();
    const res = track(await oneClickUnsubscribe(url, true, request, lookup));
    expect(res).toEqual({
      ok: false,
      reason: "Unsubscribe URL points to a private or internal address",
    });
    expect(request).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("refuses hosts that resolve to a private address", async () => {
    const request = fakeRequest(ok());
    const res = track(
      await oneClickUnsubscribe(
        "https://unsub.example/x",
        true,
        request,
        fakeLookup({ "unsub.example": [{ address: "192.168.1.10", family: 4 }] }),
      ),
    );
    expect(res).toMatchObject({ ok: false });
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses hosts where any resolved address is private", async () => {
    const request = fakeRequest(ok());
    const lookup = fakeLookup({
      "unsub.example": [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.1.10", family: 4 },
      ],
    });
    const res = track(await oneClickUnsubscribe("https://unsub.example/x", true, request, lookup));
    expect(res).toMatchObject({ ok: false });
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses when the resolver throws or returns nothing", async () => {
    const request = fakeRequest(ok());
    const throwing = vi.fn(async () => {
      throw new Error("ENOTFOUND unsub.example");
    });
    const empty = vi.fn(async () => []);
    for (const lookup of [throwing, empty]) {
      const res = track(await oneClickUnsubscribe("https://unsub.example/", true, request, lookup));
      expect(res).toEqual({ ok: false, reason: "Could not resolve unsubscribe host" });
    }
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses a redirect to plain http", async () => {
    const request = fakeRequest(redirect(307, "http://public.example/"));
    const res = track(
      await oneClickUnsubscribe("https://unsub.example/", true, request, fakeLookup()),
    );
    expect(res).toEqual({ ok: false, reason: "Unsubscribe URL is not HTTPS" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("refuses a redirect to a host that resolves to a private address", async () => {
    const request = fakeRequest(redirect(308, "https://internal.example/"));
    const lookup = fakeLookup({ "internal.example": [{ address: "10.1.2.3", family: 4 }] });
    const res = track(await oneClickUnsubscribe("https://unsub.example/", true, request, lookup));
    expect(res).toMatchObject({ ok: false });
    expect(request).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith("internal.example");
  });

  it("follows a redirect to a public https host", async () => {
    const request = fakeRequest(redirect(302, "https://other.example/done"), ok());
    const res = await oneClickUnsubscribe("https://unsub.example/", true, request, fakeLookup());
    expect(res).toEqual({ ok: true, method: "one-click" });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]![0].href).toBe("https://other.example/done");
  });

  it("resolves a relative Location against the current URL", async () => {
    const request = fakeRequest(redirect(303, "/step2"), ok());
    const res = await oneClickUnsubscribe("https://unsub.example/a/b", true, request, fakeLookup());
    expect(res).toEqual({ ok: true, method: "one-click" });
    expect(request.mock.calls[1]![0].href).toBe("https://unsub.example/step2");
  });

  it("stops after 3 redirects", async () => {
    const request = fakeRequest(
      redirect(301, "https://a.example/"),
      redirect(302, "https://b.example/"),
      redirect(307, "https://c.example/"),
      redirect(308, "https://d.example/"),
      ok(),
    );
    const res = track(
      await oneClickUnsubscribe("https://unsub.example/", true, request, fakeLookup()),
    );
    expect(res).toEqual({ ok: false, reason: "Unsubscribe endpoint redirected too many times" });
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("allows exactly 3 redirects", async () => {
    const request = fakeRequest(
      redirect(301, "https://a.example/"),
      redirect(302, "https://b.example/"),
      redirect(307, "https://c.example/"),
      ok(),
    );
    const res = await oneClickUnsubscribe("https://unsub.example/", true, request, fakeLookup());
    expect(res).toEqual({ ok: true, method: "one-click" });
    expect(request).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["300", () => redirect(300, "https://a.example/")],
    ["304", () => redirect(304)],
    ["302 without Location", () => redirect(302)],
  ])("refuses a %s response", async (_name, make) => {
    const request = fakeRequest(make(), ok());
    const res = track(
      await oneClickUnsubscribe("https://unsub.example/", true, request, fakeLookup()),
    );
    expect(res).toEqual({ ok: false, reason: "Unsubscribe endpoint returned an invalid redirect" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each(["https://user:pass@unsub.example/", "https://unsub.example:8443/"])(
    "refuses %s without requesting",
    async (url) => {
      const request = fakeRequest(ok());
      const res = track(await oneClickUnsubscribe(url, true, request, fakeLookup()));
      expect(res).toMatchObject({ ok: false });
      expect(request).not.toHaveBeenCalled();
    },
  );

  it("accepts an explicit :443", async () => {
    const request = fakeRequest(ok());
    const res = await oneClickUnsubscribe(
      "https://unsub.example:443/",
      true,
      request,
      fakeLookup(),
    );
    expect(res).toEqual({ ok: true, method: "one-click" });
  });

  it.each(["http://unsub.example/", "not a url"])("refuses %j without throwing", async (url) => {
    const request = fakeRequest(ok());
    const res = track(await oneClickUnsubscribe(url, true, request, fakeLookup()));
    expect(res).toMatchObject({ ok: false });
    expect(request).not.toHaveBeenCalled();
  });

  it("sends the RFC 8058 body with a shared timeout signal", async () => {
    const request = fakeRequest(redirect(302, "https://other.example/"), ok());
    const res = await oneClickUnsubscribe("https://unsub.example/", true, request, fakeLookup());
    expect(res).toEqual({ ok: true, method: "one-click" });
    expect(request).toHaveBeenCalledTimes(2);
    for (const [, , init] of request.mock.calls) {
      expect(init).toMatchObject({
        body: "List-Unsubscribe=One-Click",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
    expect(request.mock.calls[0]![2].signal).toBe(request.mock.calls[1]![2].signal);
  });

  it.each([
    ["DOMException TimeoutError", () => new DOMException("timed out", "TimeoutError")],
    [
      "Node AbortError",
      () => Object.assign(new Error("The operation was aborted"), { name: "AbortError" }),
    ],
  ])("turns a timeout (%s) into a refusal", async (_name, make) => {
    const request = vi.fn(async () => {
      throw make();
    });
    const res = track(
      await oneClickUnsubscribe("https://unsub.example/", true, request, fakeLookup()),
    );
    expect(res).toEqual({ ok: false, reason: "Unsubscribe request timed out" });
  });

  it("turns a network error into a refusal", async () => {
    const request = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.1:443");
    });
    const res = track(
      await oneClickUnsubscribe("https://unsub.example/", true, request, fakeLookup()),
    );
    expect(res).toEqual({ ok: false, reason: "Unsubscribe request failed" });
  });

  it("never puts the response body in the reason", async () => {
    const request = fakeRequest({
      status: 500,
      location: null,
      body: "secret-internal-detail",
    });
    const res = track(
      await oneClickUnsubscribe("https://unsub.example/", true, request, fakeLookup()),
    );
    expect(res).toEqual({ ok: false, reason: "Unsubscribe endpoint returned 500" });
  });

  it("connects to the checked address even when the host rebinds afterwards", async () => {
    const lookup = vi
      .fn(async (_host: string) => [{ address: "127.0.0.1", family: 4 }])
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    const request = fakeRequest(ok());
    const res = await oneClickUnsubscribe("https://unsub.example/x", true, request, lookup);
    expect(res).toEqual({ ok: true, method: "one-click" });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![1]).toEqual({ address: "93.184.216.34", family: 4 });
    for (const [, address] of request.mock.calls) expect(address.address).not.toBe("127.0.0.1");
  });

  it("refuses a redirect hop whose host rebinds to a private address", async () => {
    const lookup = vi
      .fn(async (_host: string) => [{ address: "127.0.0.1", family: 4 }])
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    const request = fakeRequest(redirect(302, "https://unsub.example/step2"), ok());
    const res = track(await oneClickUnsubscribe("https://unsub.example/", true, request, lookup));
    expect(res).toEqual({
      ok: false,
      reason: "Unsubscribe URL points to a private or internal address",
    });
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![1]).toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("pins each redirect hop to its own checked address", async () => {
    const lookup = fakeLookup({ "other.example": [{ address: "2606:4700::1111", family: 6 }] });
    const request = fakeRequest(redirect(302, "https://other.example/"), ok());
    const res = await oneClickUnsubscribe("https://unsub.example/", true, request, lookup);
    expect(res).toEqual({ ok: true, method: "one-click" });
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.map(([, address]) => address)).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:4700::1111", family: 6 },
    ]);
  });

  it("still refuses senders without one-click unsubscribe", async () => {
    const reason = "Sender has no one-click unsubscribe";
    expect(await oneClickUnsubscribe(undefined, true)).toEqual({ ok: false, reason });
    expect(await oneClickUnsubscribe("https://x.example/", false)).toEqual({ ok: false, reason });
  });
});
