import type { ProtectedCategory, SenderClassification } from "@sweep/shared";
import type { SenderSample } from "./mail";

/**
 * Free, deterministic checks that run before any model call. Returns a
 * classification when the signals are unambiguous, or null to ask Claude.
 */
export function prefilter(
  sample: SenderSample,
  keptSenders: string[],
): SenderClassification | null {
  const categories: ProtectedCategory[] = [];
  if (sample.starredOrImportant) categories.push("starred");
  if (sample.repliedTo) categories.push("people");

  if (keptSenders.includes(sample.address.toLowerCase())) {
    return {
      action: "keep",
      confidence: 100,
      reason: "You chose to keep this sender before.",
      signals: [{ kind: "against", text: "Previously kept by you" }],
      categories,
    };
  }

  // Anything personal or flagged gets protected by policy; no model needed.
  if (categories.length > 0) {
    return {
      action: "keep",
      confidence: 100,
      reason: sample.repliedTo
        ? "You've emailed this sender."
        : "You starred or flagged mail from this sender.",
      signals: [],
      categories,
    };
  }

  const count = sample.messageIds.length;
  const promotionsOnly =
    sample.categories.length > 0 && sample.categories.every((c) => c === "CATEGORY_PROMOTIONS");

  if (promotionsOnly && sample.oneClickUnsubscribe && sample.openedCount === 0 && count >= 5) {
    return {
      action: "unsubscribe",
      confidence: 98,
      reason: `Promotions only; ${count} emails, none opened.`,
      signals: [
        { kind: "for", text: "Has a one-click unsubscribe header (RFC 8058)" },
        { kind: "for", text: "Every message is in Promotions" },
        { kind: "for", text: "You never opened any of them" },
      ],
      categories: [],
    };
  }

  return null;
}
