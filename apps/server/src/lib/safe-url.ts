import { promises as dns } from "node:dns";
import { BlockList, isIP } from "node:net";

/** Resolves a hostname to every address it points at. */
export type Resolver = (hostname: string) => Promise<{ address: string; family: number }[]>;

export const defaultResolver: Resolver = (h) => dns.lookup(h, { all: true });

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };
/** An address `checkHost` approved; the request connects to exactly this. */
export type PinnedAddress = { address: string; family: 4 | 6 };
export type HostCheck = { ok: true; address: PinnedAddress } | { ok: false; reason: string };

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fe80::", 10],
  ["fc00::", 7],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** Only plain https URLs on the default port, with no credentials. Never throws. */
export function checkUrl(input: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "Unsubscribe URL is invalid" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Unsubscribe URL is not HTTPS" };
  if (url.username || url.password) {
    return { ok: false, reason: "Unsubscribe URL must not contain credentials" };
  }
  if (url.port !== "") return { ok: false, reason: "Unsubscribe URL uses a non-standard port" };
  return { ok: true, url };
}

/** True for loopback, private, link-local, multicast and reserved addresses, and for non-IPs. */
export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return blocked.check(ip, "ipv4");
  if (family !== 6) return true;
  let normalised: string;
  try {
    // WHATWG URL compresses IPv6 and rewrites a dotted IPv4-mapped tail as hex.
    normalised = new URL(`https://[${ip}]/`).hostname.slice(1, -1);
  } catch {
    return true;
  }
  // IPv4-compatible (::a.b.c.d), IPv4-mapped (::ffff:a.b.c.d) and IPv4-translated
  // (::ffff:0:a.b.c.d) addresses are checked by their embedded IPv4.
  const mapped = /^::(?:ffff:(?:0:)?)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalised);
  if (mapped) {
    const hi = parseInt(mapped[1]!, 16);
    const lo = parseInt(mapped[2]!, 16);
    return blocked.check(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, "ipv4");
  }
  return blocked.check(normalised, "ipv6");
}

/**
 * Allows a host only when it, or every address it resolves to, is public. On success it returns
 * the checked address, and the request must connect to exactly that address (pinned) so the host
 * can't be re-resolved to an internal one after the check.
 */
export async function checkHost(hostname: string, lookup: Resolver): Promise<HostCheck> {
  const bare = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  const internal: HostCheck = {
    ok: false,
    reason: "Unsubscribe URL points to a private or internal address",
  };
  const family = isIP(bare);
  if (family === 4 || family === 6) {
    return isBlockedAddress(bare) ? internal : { ok: true, address: { address: bare, family } };
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(bare);
  } catch {
    return { ok: false, reason: "Could not resolve unsubscribe host" };
  }
  if (addresses.length === 0) return { ok: false, reason: "Could not resolve unsubscribe host" };
  if (addresses.some((a) => isBlockedAddress(a.address))) return internal;
  const first = addresses[0]!.address;
  return { ok: true, address: { address: first, family: isIP(first) === 6 ? 6 : 4 } };
}
