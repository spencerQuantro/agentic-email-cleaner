import { randomUUID } from "node:crypto";
import { fixtures, type ActivityRow, type ActivityRun, type Rules } from "@sweep/shared";
import type {
  ActionPayload,
  LastRunStats,
  NewActivityRow,
  PendingReview,
  ReviewEntry,
  Store,
} from "./types";

type StoredRow = ActivityRow & { messageIds?: string[] };

/** In-memory store seeded with the design-mock fixtures. Resets on restart. */
export class MemoryStore implements Store {
  private rules: Rules = structuredClone(fixtures.defaultRules);
  private review: ReviewEntry[] = fixtures.reviewItems.map((item) => ({
    ...item,
    decision: null,
  }));
  private runs: Array<Omit<ActivityRun, "rows"> & { rows: StoredRow[] }> = structuredClone(
    fixtures.activityRuns,
  );
  private kept = new Set<string>();
  private sessionGeneration = 0;

  async getRules() {
    return structuredClone(this.rules);
  }

  async saveRules(rules: Rules) {
    this.rules = structuredClone(rules);
    return this.getRules();
  }

  private summary = { ...fixtures.runSummary };

  async getSummary() {
    return {
      ...this.summary,
      needsReview: this.review.filter((item) => item.decision === null).length,
    };
  }

  async setLastRun(at: Date, stats: LastRunStats) {
    this.summary = { ...this.summary, ...stats, lastRunAt: at.toISOString() };
  }

  async listReview() {
    return structuredClone(this.review);
  }

  async getReviewItem(id: string) {
    return structuredClone(this.review.find((item) => item.id === id));
  }

  async listRecentEmails(id: string) {
    return structuredClone(fixtures.recentEmails[id] ?? []);
  }

  private payloads = new Map<string, ActionPayload>(
    fixtures.reviewItems.map((item) => [
      item.id,
      { messageIds: [`demo-${item.id}`], oneClickUnsubscribe: true },
    ]),
  );

  async replacePendingReview(items: PendingReview[]) {
    const decided = this.review.filter((item) => item.decision !== null);
    this.review = [...decided, ...items.map(({ item }) => ({ ...item, decision: null }))];
    for (const { item, payload } of items) this.payloads.set(item.id, payload);
  }

  async getPayload(id: string) {
    return structuredClone(this.payloads.get(id));
  }

  async setPayload(id: string, payload: ActionPayload) {
    this.payloads.set(id, structuredClone(payload));
  }

  async setDecision(id: string, decision: ReviewEntry["decision"]) {
    const item = this.review.find((entry) => entry.id === id);
    if (!item) return undefined;
    item.decision = decision;
    return structuredClone(item);
  }

  async listActivity() {
    return this.runs.map((run) => ({
      ...run,
      rows: run.rows.map(({ messageIds: _ids, ...row }) => row),
    }));
  }

  async recordRun(run: { title: string; summary: string; rows: NewActivityRow[] }) {
    const id = randomUUID();
    this.runs.unshift({
      id,
      title: run.title,
      summary: run.summary,
      rows: run.rows.map((row) => ({ ...row, id: randomUUID(), restored: false })),
    });
    return id;
  }

  async getActivityRow(id: string) {
    return structuredClone(this.findRow(id));
  }

  async markRestored(id: string) {
    const row = this.findRow(id);
    if (!row) return undefined;
    row.restored = true;
    const { messageIds: _ids, ...rest } = row;
    return structuredClone(rest);
  }

  async recordKeep(address: string) {
    this.kept.add(address.toLowerCase());
  }

  async keptSenders() {
    return [...this.kept];
  }

  async getSessionGeneration() {
    return this.sessionGeneration;
  }

  async bumpSessionGeneration() {
    return ++this.sessionGeneration;
  }

  private findRow(id: string) {
    for (const run of this.runs) {
      const row = run.rows.find((r) => r.id === id);
      if (row) return row;
    }
    return undefined;
  }
}
