import type { SenderClassification } from "@sweep/shared";
import type { Classifier } from "../engine/classifier";
import type { MailProvider, SenderSample, UnsubscribeResult } from "../engine/mail";

export function sample(overrides: Partial<SenderSample> = {}): SenderSample {
  return {
    address: "deals@shop.example",
    name: "Shop",
    messageIds: ["m1", "m2", "m3", "m4", "m5", "m6"],
    subjects: ["Big sale"],
    snippets: ["Everything 20% off"],
    unsubscribeUrl: "https://shop.example/unsub",
    oneClickUnsubscribe: true,
    categories: ["CATEGORY_PROMOTIONS"],
    openedCount: 0,
    starredOrImportant: false,
    repliedTo: false,
    newestDate: "2026-11-01T00:00:00.000Z",
    oldestDate: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Records every call instead of touching a mailbox. */
export class FakeMail implements MailProvider {
  trashed: string[] = [];
  untrashed: string[] = [];
  unsubscribed = 0;

  constructor(private samples: SenderSample[] = []) {}

  async collectSenders() {
    return this.samples;
  }
  async trash(ids: string[]) {
    this.trashed.push(...ids);
  }
  async untrash(ids: string[]) {
    this.untrashed.push(...ids);
  }
  async unsubscribe(): Promise<UnsubscribeResult> {
    this.unsubscribed++;
    return { ok: true, method: "one-click" };
  }
}

export function fakeClassifier(
  byAddress: Record<string, Partial<SenderClassification>>,
): Classifier {
  return async (s) => ({
    action: "keep",
    confidence: 50,
    reason: "Not sure",
    signals: [],
    categories: [],
    ...byAddress[s.address],
  });
}
