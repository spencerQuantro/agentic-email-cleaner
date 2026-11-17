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

/** Sends an RFC 8058 one-click unsubscribe request. */
export async function oneClickUnsubscribe(
  url: string | undefined,
  oneClick: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<UnsubscribeResult> {
  if (!url || !oneClick) return { ok: false, reason: "Sender has no one-click unsubscribe" };
  if (!url.startsWith("https://")) return { ok: false, reason: "Unsubscribe URL is not HTTPS" };
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
    redirect: "follow",
  });
  return res.ok
    ? { ok: true, method: "one-click" }
    : { ok: false, reason: `Unsubscribe endpoint returned ${res.status}` };
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
