import type { Decision } from "@sweep/shared";
import type { ReviewEntry, Store } from "../store/types";
import type { MailProvider } from "./mail";

export class ActionError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 502,
  ) {
    super(message);
  }
}

/** Carries out a review decision: act on approvals, remember keeps. */
export async function applyDecision(
  deps: { store: Store; mail: MailProvider },
  id: string,
  decision: Decision,
): Promise<ReviewEntry> {
  const { store, mail } = deps;
  const item = await store.getReviewItem(id);
  if (!item) throw new ActionError("Review item not found", 404);
  if (item.decision) throw new ActionError("This sender has already been decided", 409);

  if (decision === "kept") {
    await store.recordKeep(item.address);
    return (await store.setDecision(id, "kept"))!;
  }

  const payload = await store.getPayload(id);
  if (!payload) throw new ActionError("Nothing to act on for this sender", 409);
  const rules = await store.getRules();

  if (item.action === "unsubscribe" && !rules.dryRun) {
    const res = await mail.unsubscribe(payload);
    if (!res.ok) throw new ActionError(res.reason, 502);
  }
  if (item.action === "delete" && !rules.dryRun) {
    await mail.trash(payload.messageIds);
  }

  await store.recordRun({
    title: `${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · your review`,
    summary: "1 decision",
    rows: [
      {
        sender: item.sender,
        action:
          item.action === "unsubscribe"
            ? "Unsubscribed"
            : `Moved ${payload.messageIds.length} to Trash`,
        why: item.reason,
        decidedBy: "user",
        kind: item.action,
        messageIds: item.action === "delete" ? payload.messageIds : undefined,
        dryRun: rules.dryRun,
      },
    ],
  });
  return (await store.setDecision(id, "approved"))!;
}

/**
 * Reverts a decision. Keeps and deletes can be undone (deleted mail comes
 * back from Trash). An unsubscribe request can't be taken back.
 */
export async function undoDecision(deps: { store: Store; mail: MailProvider }, id: string) {
  const { store, mail } = deps;
  const item = await store.getReviewItem(id);
  if (!item) throw new ActionError("Review item not found", 404);
  if (!item.decision) return item;

  if (item.decision === "approved") {
    if (item.action === "unsubscribe") {
      throw new ActionError(
        "An unsubscribe can't be undone. Resubscribe on the sender's site.",
        409,
      );
    }
    const payload = await store.getPayload(id);
    const rules = await store.getRules();
    if (payload && !rules.dryRun) await mail.untrash(payload.messageIds);
  }
  return (await store.setDecision(id, null))!;
}

/** Moves a logged delete back out of Trash. */
export async function restoreActivity(deps: { store: Store; mail: MailProvider }, rowId: string) {
  const { store, mail } = deps;
  const row = await store.getActivityRow(rowId);
  if (!row) throw new ActionError("Activity not found", 404);
  if (row.kind !== "delete") throw new ActionError("Only deletes can be restored", 409);
  if (row.restored) throw new ActionError("Already restored", 409);
  if (row.messageIds?.length && !row.dryRun) await mail.untrash(row.messageIds);
  return (await store.markRestored(rowId))!;
}
