import { checkHost, checkUrl, defaultResolver, type Resolver } from "../lib/safe-url";

/** Everything Sweep knows about one sender, gathered from message metadata only. */
export interface SenderSample {
  address: string;
  name: string;
  messageIds: string[];
  /** Up to 8 recent subject lines. */
  subjects: string[];
  /** Up to 5 short Gmail snippets (never full bodies). */
  snippets: string[];
  /** HTTPS URL from List-Unsubscribe, if the sender provides one. */
  unsubscribeUrl?: string;
  /** True when List-Unsubscribe-Post=One-Click is present (RFC 8058). */
  oneClickUnsubscribe: boolean;
  /** Gmail category labels seen, e.g. CATEGORY_PROMOTIONS. */
  categories: string[];
  openedCount: number;
  starredOrImportant: boolean;
  /** The user has sent mail to this address. */
  repliedTo: boolean;
  newestDate: string;
  oldestDate: string;
}

export type UnsubscribeResult = { ok: true; method: "one-click" } | { ok: false; reason: string };

/** The Gmail boundary. GmailProvider talks to Google; tests and demo mode use fakes. */
export interface MailProvider {
  collectSenders(opts?: { query?: string; maxMessages?: number }): Promise<SenderSample[]>;
  /** Moves messages to Trash (Gmail keeps them 30 days). Never deletes permanently. */
  trash(messageIds: string[]): Promise<void>;
  untrash(messageIds: string[]): Promise<void>;
  unsubscribe(
    sample: Pick<SenderSample, "unsubscribeUrl" | "oneClickUnsubscribe">,
  ): Promise<UnsubscribeResult>;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 3;

/**
 * Sends an RFC 8058 one-click unsubscribe request. The URL comes from the sender, so every hop
 * (including each redirect) must pass `checkUrl` and `checkHost` first. Never throws.
 */
export async function oneClickUnsubscribe(
  url: string | undefined,
  oneClick: boolean,
  fetchImpl: typeof fetch = fetch,
  lookup: Resolver = defaultResolver,
): Promise<UnsubscribeResult> {
  if (!url || !oneClick) return { ok: false, reason: "Sender has no one-click unsubscribe" };
  const signal = AbortSignal.timeout(10_000);
  try {
    let current = url;
    for (let redirects = 0; ; redirects++) {
      const checked = checkUrl(current);
      if (!checked.ok) return checked;
      const host = await checkHost(checked.url.hostname, lookup);
      if (!host.ok) return host;
      const res = await fetchImpl(checked.url.href, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
        redirect: "manual",
        signal,
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (
          !REDIRECT_STATUSES.has(res.status) ||
          !location ||
          !URL.canParse(location, checked.url.href)
        ) {
          return { ok: false, reason: "Unsubscribe endpoint returned an invalid redirect" };
        }
        if (redirects === MAX_REDIRECTS) {
          return { ok: false, reason: "Unsubscribe endpoint redirected too many times" };
        }
        current = new URL(location, checked.url).href;
        continue;
      }
      return res.ok
        ? { ok: true, method: "one-click" }
        : { ok: false, reason: `Unsubscribe endpoint returned ${res.status}` };
    }
  } catch (err) {
    const timedOut =
      err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      ok: false,
      reason: timedOut ? "Unsubscribe request timed out" : "Unsubscribe request failed",
    };
  }
}

/** Logs instead of touching a mailbox. Used in demo mode. */
export class NoopMailProvider implements MailProvider {
  async collectSenders() {
    return [];
  }
  async trash(ids: string[]) {
    console.info(`[demo] would move ${ids.length} messages to Trash`);
  }
  async untrash(ids: string[]) {
    console.info(`[demo] would restore ${ids.length} messages`);
  }
  async unsubscribe(): Promise<UnsubscribeResult> {
    console.info("[demo] would send a one-click unsubscribe");
    return { ok: true, method: "one-click" };
  }
}
