import { afterEach, describe, expect, it, vi } from "vitest";
import { oneClickUnsubscribe, type UnsubscribeResult } from "./mail";

const PUBLIC = [{ address: "93.184.216.34", family: 4 }];

/** Maps hostnames to addresses; unknown hosts resolve to a public address. */
function fakeLookup(table: Record<string, { address: string; family: number }[]> = {}) {
  return vi.fn(async (host: string) => table[host] ?? PUBLIC);
}

/** Returns the given responses in order. */
function fakeFetch(...responses: Response[]) {
  const fn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    return next;
  });
  return fn;
}

const redirect = (status: number, location?: string) =>
  new Response(null, { status, headers: location ? { Location: location } : {} });

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
  ])("refuses the IP literal %s without resolving or fetching", async (url) => {
    const fetch = fakeFetch(new Response("ok"));
    const lookup = fakeLookup();
    const res = track(await oneClickUnsubscribe(url, true, fetch, lookup));
    expect(res).toEqual({
      ok: false,
      reason: "Unsubscribe URL points to a private or internal address",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("refuses hosts that resolve to a private address", async () => {
    const fetch = fakeFetch(new Response("ok"));
    const res = track(
      await oneClickUnsubscribe(
        "https://unsub.example/x",
        true,
        fetch,
        fakeLookup({ "unsub.example": [{ address: "192.168.1.10", family: 4 }] }),
      ),
    );
    expect(res).toMatchObject({ ok: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses hosts where any resolved address is private", async () => {
    const fetch = fakeFetch(new Response("ok"));
    const lookup = fakeLookup({
      "unsub.example": [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.1.10", family: 4 },
      ],
    });
    const res = track(await oneClickUnsubscribe("https://unsub.example/x", true, fetch, lookup));
    expect(res).toMatchObject({ ok: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses when the resolver throws or returns nothing", async () => {
    const fetch = fakeFetch(new Response("ok"));
    const throwing = vi.fn(async () => {
      throw new Error("ENOTFOUND unsub.example");
    });
    const empty = vi.fn(async () => []);
    for (const lookup of [throwing, empty]) {
      const res = track(await oneClickUnsubscribe("https://unsub.example/", true, fetch, lookup));
      expect(res).toEqual({ ok: false, reason: "Could not resolve unsubscribe host" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a redirect to plain http", async () => {
    const fetch = fakeFetch(redirect(307, "http://public.example/"));
    const res = track(
      await oneClickUnsubscribe("https://unsub.example/", true, fetch, fakeLookup()),
    );
    expect(res).toEqual({ ok: false, reason: "Unsubscribe URL is not HTTPS" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses a redirect to a host that resolves to a private address", async () => {
    const fetch = fakeFetch(redirect(308, "https://internal.example/"));
    const lookup = fakeLookup({ "internal.example": [{ address: "10.1.2.3", family: 4 }] });
    const res = track(await oneClickUnsubscribe("https://unsub.example/", true, fetch, lookup));
    expect(res).toMatchObject({ ok: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith("internal.example");
  });

  it("follows a redirect to a public https host", async () => {
    const fetch = fakeFetch(redirect(302, "https://other.example/done"), new Response("ok"));
    const res = await oneClickUnsubscribe("https://unsub.example/", true, fetch, fakeLookup());
    expect(res).toEqual({ ok: true, method: "one-click" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]![0]).toBe("https://other.example/done");
  });

  it("resolves a relative Location against the current URL", async () => {
    const fetch = fakeFetch(redirect(303, "/step2"), new Response("ok"));
    const res = await oneClickUnsubscribe("https://unsub.example/a/b", true, fetch, fakeLookup());
    expect(res).toEqual({ ok: true, method: "one-click" });
    expect(fetch.mock.calls[1]![0]).toBe("https://unsub.example/step2");
  });

  it("stops after 3 redirects", async () => {
    const fetch = fakeFetch(
      redirect(301, "https://a.example/"),
      redirect(302, "https://b.example/"),
      redirect(307, "https://c.example/"),
      redirect(308, "https://d.example/"),
      new Response("ok"),
    );
    const res = track(
      await oneClickUnsubscribe("https://unsub.example/", true, fetch, fakeLookup()),
    );
    expect(res).toEqual({ ok: false, reason: "Unsubscribe endpoint redirected too many times" });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("allows exactly 3 redirects", async () => {
    const fetch = fakeFetch(
      redirect(301, "https://a.example/"),
      redirect(302, "https://b.example/"),
      redirect(307, "https://c.example/"),
      new Response("ok"),
    );
    const res = await oneClickUnsubscribe("https://unsub.example/", true, fetch, fakeLookup());
    expect(res).toEqual({ ok: true, method: "one-click" });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["300", () => redirect(300, "https://a.example/")],
    ["304", () => redirect(304)],
    ["302 without Location", () => redirect(302)],
  ])("refuses a %s response", async (_name, make) => {
    const fetch = fakeFetch(make(), new Response("ok"));
    const res = track(
      await oneClickUnsubscribe("https://unsub.example/", true, fetch, fakeLookup()),
    );
    expect(res).toEqual({ ok: false, reason: "Unsubscribe endpoint returned an invalid redirect" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["https://user:pass@unsub.example/", "https://unsub.example:8443/"])(
    "refuses %s without fetching",
    async (url) => {
      const fetch = fakeFetch(new Response("ok"));
      const res = track(await oneClickUnsubscribe(url, true, fetch, fakeLookup()));
      expect(res).toMatchObject({ ok: false });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("accepts an explicit :443", async () => {
    const fetch = fakeFetch(new Response("ok"));
    const res = await oneClickUnsubscribe("https://unsub.example:443/", true, fetch, fakeLookup());
    expect(res).toEqual({ ok: true, method: "one-click" });
  });

  it.each(["http://unsub.example/", "not a url"])("refuses %j without throwing", async (url) => {
    const fetch = fakeFetch(new Response("ok"));
    const res = track(await oneClickUnsubscribe(url, true, fetch, fakeLookup()));
    expect(res).toMatchObject({ ok: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the RFC 8058 POST with manual redirects and a timeout signal", async () => {
    const fetch = fakeFetch(redirect(302, "https://other.example/"), new Response("ok"));
    const res = await oneClickUnsubscribe("https://unsub.example/", true, fetch, fakeLookup());
    expect(res).toEqual({ ok: true, method: "one-click" });
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, init] of fetch.mock.calls) {
      expect(init).toMatchObject({
        method: "POST",
        redirect: "manual",
        body: "List-Unsubscribe=One-Click",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      expect(init!.signal).toBeInstanceOf(AbortSignal);
    }
    expect(fetch.mock.calls[0]![1]!.signal).toBe(fetch.mock.calls[1]![1]!.signal);
  });

  it("turns a timeout into a refusal", async () => {
    const fetch = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    const res = track(
      await oneClickUnsubscribe("https://unsub.example/", true, fetch, fakeLookup()),
    );
    expect(res).toEqual({ ok: false, reason: "Unsubscribe request timed out" });
  });

  it("turns a network error into a refusal", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed: connect ECONNREFUSED 10.0.0.1:443");
    });
    const res = track(
      await oneClickUnsubscribe("https://unsub.example/", true, fetch, fakeLookup()),
    );
    expect(res).toEqual({ ok: false, reason: "Unsubscribe request failed" });
  });

  it("never puts the response body in the reason", async () => {
    const fetch = fakeFetch(new Response("secret-internal-detail", { status: 500 }));
    const res = track(
      await oneClickUnsubscribe("https://unsub.example/", true, fetch, fakeLookup()),
    );
    expect(res).toEqual({ ok: false, reason: "Unsubscribe endpoint returned 500" });
  });

  it("still refuses senders without one-click unsubscribe", async () => {
    const reason = "Sender has no one-click unsubscribe";
    expect(await oneClickUnsubscribe(undefined, true)).toEqual({ ok: false, reason });
    expect(await oneClickUnsubscribe("https://x.example/", false)).toEqual({ ok: false, reason });
  });
});
