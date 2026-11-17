import type { Rules, SenderClassification } from "./schemas";

export type PolicyOutcome =
  | { kind: "protected"; reason: string }
  | { kind: "keep" }
  | { kind: "auto"; action: "unsubscribe" | "delete" }
  | { kind: "review"; action: "unsubscribe" | "delete" };

export interface PolicyInput {
  senderAddress: string;
  classification: SenderClassification;
  rules: Rules;
}

function matchesProtectedSender(address: string, entries: string[]): string | undefined {
  const lower = address.toLowerCase();
  const domain = lower.split("@")[1] ?? "";
  return entries.find((raw) => {
    const entry = raw.toLowerCase().trim();
    if (entry.includes("@")) return entry === lower;
    return domain === entry || domain.endsWith(`.${entry}`);
  });
}

/**
 * The single place that decides whether Sweep may act on its own.
 *
 * This is deliberately plain code, not part of the prompt: the model only
 * reports a confidence score, and the threshold is enforced here.
 */
export function decide({ senderAddress, classification, rules }: PolicyInput): PolicyOutcome {
  const sender = matchesProtectedSender(senderAddress, rules.protectedSenders);
  if (sender) return { kind: "protected", reason: `Protected sender: ${sender}` };

  const category = classification.categories.find((c) => rules.protectedCategories[c]);
  if (category) return { kind: "protected", reason: `Protected category: ${category}` };

  if (classification.action === "keep") return { kind: "keep" };

  const action = classification.action;
  const allowed = action === "unsubscribe" ? rules.autoUnsubscribe : rules.autoDelete;

  if (allowed && classification.confidence >= rules.threshold) {
    return { kind: "auto", action };
  }
  return { kind: "review", action };
}
