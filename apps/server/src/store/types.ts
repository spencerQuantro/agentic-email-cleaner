import type {
  ActivityRow,
  ActivityRun,
  Decision,
  ReviewItem,
  Rules,
  RunSummary,
} from "@sweep/shared";
import type { LastRunStats, ReviewPayload } from "../db/schema";

export type { LastRunStats };

/** A review item as returned to the UI: pending, or decided (and undoable). */
export type ReviewEntry = ReviewItem & { decision: Decision | null };

/** Server-only data needed to carry out a review decision. Never sent to the UI. */
export type ActionPayload = ReviewPayload;

export interface PendingReview {
  item: ReviewItem;
  payload: ActionPayload;
}

export interface NewActivityRow extends Omit<ActivityRow, "id" | "restored"> {
  messageIds?: string[];
}

/**
 * Persistence boundary. MemoryStore backs demo mode and tests; DbStore backs
 * a real instance. Routes and the run engine only ever see this interface.
 */
export interface Store {
  getRules(): Promise<Rules>;
  saveRules(rules: Rules): Promise<Rules>;

  getSummary(): Promise<RunSummary>;
  setLastRun(at: Date, stats: LastRunStats): Promise<void>;

  listReview(): Promise<ReviewEntry[]>;
  getReviewItem(id: string): Promise<ReviewEntry | undefined>;
  /** Replaces all pending items with a fresh set from the latest run. */
  replacePendingReview(items: PendingReview[]): Promise<void>;
  setDecision(id: string, decision: Decision | null): Promise<ReviewEntry | undefined>;
  getPayload(id: string): Promise<ActionPayload | undefined>;
  setPayload(id: string, payload: ActionPayload): Promise<void>;

  listActivity(): Promise<ActivityRun[]>;
  /** Creates a run and its rows in one go; returns the run id. */
  recordRun(run: { title: string; summary: string; rows: NewActivityRow[] }): Promise<string>;
  getActivityRow(id: string): Promise<(ActivityRow & { messageIds?: string[] }) | undefined>;
  markRestored(id: string): Promise<ActivityRow | undefined>;

  recordKeep(address: string): Promise<void>;
  keptSenders(): Promise<string[]>;
}
