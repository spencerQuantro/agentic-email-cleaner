import { google, type gmail_v1 } from "googleapis";
import { oneClickUnsubscribe, type MailProvider, type SenderSample } from "./mail";
import { parseFrom, sentMailQuery } from "./sender-address";

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.modify", "openid", "email"];

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function createOAuthClient(config: GoogleOAuthConfig) {
  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
}

const DEFAULT_QUERY =
  "newer_than:180d (category:promotions OR category:updates OR category:forums OR category:social)";

function header(msg: gmail_v1.Schema$Message, name: string) {
  return (
    msg.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
    undefined
  );
}

function httpsUnsubscribeUrl(listUnsubscribe: string | undefined) {
  return listUnsubscribe
    ?.match(/<([^>]+)>/g)
    ?.map((part) => part.slice(1, -1))
    .find((url) => url.startsWith("https://"));
}

/** Small concurrency limiter so we stay inside Gmail API quotas. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]!);
      }
    }),
  );
  return results;
}

/** Talks to the real Gmail API with the user's OAuth credentials. */
export class GmailProvider implements MailProvider {
  private gmail: gmail_v1.Gmail;

  constructor(auth: ReturnType<typeof createOAuthClient>) {
    this.gmail = google.gmail({ version: "v1", auth });
  }

  async collectSenders({ query = DEFAULT_QUERY, maxMessages = 2000 } = {}) {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const res = await this.gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: Math.min(500, maxMessages - ids.length),
        pageToken,
      });
      ids.push(...(res.data.messages ?? []).flatMap((m) => (m.id ? [m.id] : [])));
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken && ids.length < maxMessages);

    const messages = await mapLimit(ids, 10, async (id) => {
      const res = await this.gmail.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date", "List-Unsubscribe", "List-Unsubscribe-Post"],
      });
      return res.data;
    });

    const bySender = new Map<string, SenderSample>();
    for (const msg of messages) {
      const from = header(msg, "From");
      if (!from || !msg.id) continue;
      const { name, address } = parseFrom(from);
      const labels = msg.labelIds ?? [];
      const date = new Date(Number(msg.internalDate ?? 0)).toISOString();
      const sample =
        bySender.get(address) ??
        ({
          address,
          name,
          messageIds: [],
          subjects: [],
          snippets: [],
          oneClickUnsubscribe: false,
          categories: [],
          openedCount: 0,
          starredOrImportant: false,
          repliedTo: false,
          newestDate: date,
          oldestDate: date,
        } satisfies SenderSample);

      sample.messageIds.push(msg.id);
      const subject = header(msg, "Subject");
      if (subject && sample.subjects.length < 8) sample.subjects.push(subject);
      if (msg.snippet && sample.snippets.length < 5)
        sample.snippets.push(msg.snippet.slice(0, 200));
      sample.unsubscribeUrl ??= httpsUnsubscribeUrl(header(msg, "List-Unsubscribe"));
      if (header(msg, "List-Unsubscribe-Post")?.toLowerCase().includes("one-click")) {
        sample.oneClickUnsubscribe = true;
      }
      for (const label of labels) {
        if (label.startsWith("CATEGORY_") && !sample.categories.includes(label))
          sample.categories.push(label);
      }
      if (!labels.includes("UNREAD")) sample.openedCount++;
      if (labels.includes("STARRED") || labels.includes("IMPORTANT"))
        sample.starredOrImportant = true;
      if (date > sample.newestDate) sample.newestDate = date;
      if (date < sample.oldestDate) sample.oldestDate = date;
      bySender.set(address, sample);
    }

    const samples = [...bySender.values()];
    await mapLimit(samples, 5, async (sample) => {
      // Untrusted From header: skip the search for invalid addresses (repliedTo stays false).
      const q = sentMailQuery(sample.address);
      if (q === undefined) return;
      const sent = await this.gmail.users.messages.list({ userId: "me", q, maxResults: 1 });
      sample.repliedTo = (sent.data.messages?.length ?? 0) > 0;
    });
    return samples;
  }

  async trash(messageIds: string[]) {
    await mapLimit(messageIds, 10, (id) => this.gmail.users.messages.trash({ userId: "me", id }));
  }

  async untrash(messageIds: string[]) {
    await mapLimit(messageIds, 10, (id) => this.gmail.users.messages.untrash({ userId: "me", id }));
  }

  async unsubscribe(sample: Pick<SenderSample, "unsubscribeUrl" | "oneClickUnsubscribe">) {
    return oneClickUnsubscribe(sample.unsubscribeUrl, sample.oneClickUnsubscribe);
  }
}
