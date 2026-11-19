import { request, type RequestOptions } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import type { PinnedAddress } from "./safe-url";

export type PinnedRequestInit = {
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
};

/** Sends one request to a pinned address and resolves once the status line and headers arrive. */
export type PinnedRequest = (
  url: URL,
  address: PinnedAddress,
  init: PinnedRequestInit,
) => Promise<{ status: number; location: string | null }>;

/** A `lookup` that always yields the pinned address and never calls DNS. */
export function pinnedLookup(pinned: PinnedAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [{ address: pinned.address, family: pinned.family }]);
    else callback(null, pinned.address, pinned.family);
  };
}

/**
 * POST options for `url` that connect to `pinned` while SNI, certificate checks and `Host` still
 * use the URL's hostname. `agent: false` opens a fresh connection, so no pooled socket is reused.
 */
export function pinnedRequestOptions(
  url: URL,
  pinned: PinnedAddress,
  init: PinnedRequestInit,
): RequestOptions {
  const hostname = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  return {
    method: "POST",
    host: hostname,
    hostname,
    port: 443,
    path: url.pathname + url.search,
    headers: {
      ...init.headers,
      Host: url.host,
      "Content-Length": String(Buffer.byteLength(init.body)),
    },
    // SNI doesn't allow IP addresses.
    ...(isIP(hostname) ? {} : { servername: hostname }),
    lookup: pinnedLookup(pinned),
    agent: false,
    signal: init.signal,
  };
}

/** The default transport: `node:https` pinned to the checked address. Never reads the body. */
export const pinnedRequest: PinnedRequest = (url, pinned, init) =>
  new Promise((resolve, reject) => {
    const req = request(pinnedRequestOptions(url, pinned, init), (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location ?? null;
      res.destroy();
      resolve({ status, location });
    });
    req.on("error", reject);
    req.end(init.body);
  });
