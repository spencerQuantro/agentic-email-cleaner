import { decide, type ReviewItem } from "@sweep/shared";
import type { NewActivityRow, PendingReview, Store } from "../store/types";
import type { Classifier } from "./classifier";
import type { MailProvider, SenderSample } from "./mail";
import { prefilter } from "./prefilter";

export interface RunResult {
  runId: string;
  autoUnsubscribed: number;
  movedToTrash: number;
  needsReview: number;
  protectedCount: number;
  errors: Array<{ address: string; message: string }>;
}

function initials(name: string) {
  const words = name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
  const letters = words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

function slug(address: string) {
  return address.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function toReviewItem(
  sample: SenderSample,
  action: "unsubscribe" | "delete",
  confidence: number,
  reason: string,
): ReviewItem {
  const count = sample.messageIds.length;
  return {
    id: slug(sample.address),
    sender: sample.name,
    initials: initials(sample.name),
    address: sample.address,
    volume: `${count} emails / 6 mo`,
    action,
    deleteCount: action === "delete" ? `${count} emails` : undefined,
    confidence,
    reason,
    hasDetail: true,
  };
}

/**
 * One cleanup pass: gather senders, run free checks, ask Claude only about the
 * rest, then act, queue for review, or protect according to the user's rules.
 */
export async function runSweep(deps: {
  store: Store;
  mail: MailProvider;
  classify: Classifier;
  now?: () => Date;
}): Promise<RunResult> {
  const { store, mail, classify } = deps;
  const now = deps.now ?? (() => new Date());
  const rules = await store.getRules();
  const kept = await store.keptSenders();
  const samples = await mail.collectSenders();

  const rows: NewActivityRow[] = [];
  const pending: PendingReview[] = [];
  const result: Omit<RunResult, "runId"> = {
    autoUnsubscribed: 0,
    movedToTrash: 0,
    needsReview: 0,
    protectedCount: 0,
    errors: [],
  };

  for (const sample of samples) {
    try {
      const classification = prefilter(sample, kept) ?? (await classify(sample));
      const outcome = decide({ senderAddress: sample.address, classification, rules });
      const count = sample.messageIds.length;

      if (outcome.kind === "protected") {
        result.protectedCount += count;
      } else if (outcome.kind === "review") {
        pending.push({
          item: toReviewItem(
            sample,
            outcome.action,
            classification.confidence,
            classification.reason,
          ),
          payload: {
            messageIds: sample.messageIds,
            unsubscribeUrl: sample.unsubscribeUrl,
            oneClickUnsubscribe: sample.oneClickUnsubscribe,
          },
        });
      } else if (outcome.kind === "auto") {
        if (outcome.action === "unsubscribe") {
          if (!rules.dryRun) {
            const res = await mail.unsubscribe(sample);
            if (!res.ok) throw new Error(res.reason);
          }
          result.autoUnsubscribed++;
          rows.push({
            sender: sample.name,
            action: "Unsubscribed",
            why: classification.reason,
            decidedBy: "auto",
            confidence: classification.confidence,
            kind: "unsubscribe",
            dryRun: rules.dryRun,
          });
        } else {
          if (!rules.dryRun) await mail.trash(sample.messageIds);
          result.movedToTrash += count;
          rows.push({
            sender: sample.name,
            action: `Moved ${count} to Trash`,
            why: classification.reason,
            decidedBy: "auto",
            confidence: classification.confidence,
            kind: "delete",
            messageIds: sample.messageIds,
            dryRun: rules.dryRun,
          });
        }
      }
    } catch (error) {
      result.errors.push({
        address: sample.address,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  result.needsReview = pending.length;
  await store.replacePendingReview(pending);

  const at = now();
  const runId = await store.recordRun({
    title: at.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }),
    summary: `${result.autoUnsubscribed} unsubscribes · ${result.movedToTrash} emails to Trash · ${result.needsReview} sent to review${rules.dryRun ? " · dry run" : ""}`,
    rows,
  });
  await store.setLastRun(at, {
    autoUnsubscribed: result.autoUnsubscribed,
    movedToTrash: result.movedToTrash,
    protectedCount: result.protectedCount,
  });

  return { runId, ...result };
}
