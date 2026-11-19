import { EventEmitter } from "node:events";
import dns from "node:dns";
import { afterEach, describe, expect, it, vi } from "vitest";

const https = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("node:https", () => https);
vi.mock("node:dns", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:dns")>();
  const lookup = vi.fn(() => {
    throw new Error("unexpected DNS lookup");
  });
  const promises = { ...real.promises, lookup };
  return { ...real, default: { ...real, lookup, promises }, lookup, promises };
});

import { pinnedLookup, pinnedRequest, pinnedRequestOptions } from "./pinned-request";

const PINNED = { address: "93.184.216.34", family: 4 } as const;
const init = () => ({
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: "List-Unsubscribe=One-Click",
  signal: new AbortController().signal,
});

afterEach(() => {
  expect(dns.lookup).not.toHaveBeenCalled();
  expect(dns.promises.lookup).not.toHaveBeenCalled();
  https.request.mockReset();
});

describe("pinnedLookup", () => {
  it.each(["unsub.example", "localhost", "anything.else"])(
    "yields the pinned address for %s in the all form",
    (host) => {
      const callback = vi.fn();
      pinnedLookup(PINNED)(host, { all: true }, callback);
      expect(callback).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
    },
  );

  it.each(["unsub.example", "localhost"])(
    "yields the pinned address for %s in the single form",
    (host) => {
      const callback = vi.fn();
      pinnedLookup({ address: "2606:4700::1111", family: 6 })(host, {}, callback);
      expect(callback).toHaveBeenCalledWith(null, "2606:4700::1111", 6);
    },
  );
});

describe("pinnedRequestOptions", () => {
  it("keeps the hostname for SNI, certificates and Host while pinning the address", () => {
    const opts = pinnedRequestOptions(new URL("https://unsub.example/x?y=1"), PINNED, init());
    expect(opts).toMatchObject({
      method: "POST",
      host: "unsub.example",
      hostname: "unsub.example",
      servername: "unsub.example",
      port: 443,
      path: "/x?y=1",
      agent: false,
      headers: {
        Host: "unsub.example",
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": "26",
      },
    });
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    expect(opts).not.toHaveProperty("rejectUnauthorized");
    const callback = vi.fn();
    opts.lookup!("unsub.example", { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
  });

  it("leaves servername unset for IP-literal URLs", () => {
    const v4 = pinnedRequestOptions(new URL("https://93.184.216.34/"), PINNED, init());
    expect(v4).not.toHaveProperty("servername");
    expect(v4).toMatchObject({ host: "93.184.216.34", headers: { Host: "93.184.216.34" } });
    const v6 = pinnedRequestOptions(
      new URL("https://[2606:4700::1111]/"),
      { address: "2606:4700::1111", family: 6 },
      init(),
    );
    expect(v6).not.toHaveProperty("servername");
    expect(v6).toMatchObject({ host: "2606:4700::1111", headers: { Host: "[2606:4700::1111]" } });
  });
});

describe("pinnedRequest", () => {
  function fakeHttps(status: number, headers: Record<string, string>) {
    const req = Object.assign(new EventEmitter(), { end: vi.fn() });
    const res = Object.assign(new EventEmitter(), {
      statusCode: status,
      headers,
      destroy: vi.fn(),
      resume: vi.fn(),
      read: vi.fn(),
    });
    https.request.mockImplementation((_opts, onResponse: (r: typeof res) => void) => {
      queueMicrotask(() => onResponse(res));
      return req;
    });
    return { req, res };
  }

  it("sends the body, resolves with status and location, and releases the response", async () => {
    const { req, res } = fakeHttps(302, { location: "https://other.example/" });
    const url = new URL("https://unsub.example/x");
    const reply = await pinnedRequest(url, PINNED, init());
    expect(reply).toEqual({ status: 302, location: "https://other.example/" });
    expect(https.request.mock.calls[0]![0]).toMatchObject({
      servername: "unsub.example",
      agent: false,
    });
    expect(req.end).toHaveBeenCalledWith("List-Unsubscribe=One-Click");
    expect(res.destroy).toHaveBeenCalled();
    expect(res.read).not.toHaveBeenCalled();
    expect(res.listenerCount("data")).toBe(0);
  });

  it("resolves a final response without a location", async () => {
    const { res } = fakeHttps(200, {});
    const reply = await pinnedRequest(new URL("https://unsub.example/"), PINNED, init());
    expect(reply).toEqual({ status: 200, location: null });
    expect(res.destroy).toHaveBeenCalled();
  });

  it("rejects on a request error", async () => {
    const req = Object.assign(new EventEmitter(), { end: vi.fn() });
    https.request.mockImplementation(() => {
      queueMicrotask(() =>
        req.emit("error", Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
      return req;
    });
    await expect(
      pinnedRequest(new URL("https://unsub.example/"), PINNED, init()),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
