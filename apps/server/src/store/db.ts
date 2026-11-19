import { randomUUID } from "node:crypto";
import { desc, eq, isNull, sql } from "drizzle-orm";
import { fixtures, type ActivityRow, type ActivityRun, type Rules } from "@sweep/shared";
import type { Db } from "../db/client";
import { activityRows, activityRuns, reviewItems, senderFeedback, settings } from "../db/schema";
import type {
  ActionPayload,
  LastRunStats,
  NewActivityRow,
  PendingReview,
  ReviewEntry,
  Store,
} from "./types";

type ReviewRecord = typeof reviewItems.$inferSelect;
type RowRecord = typeof activityRows.$inferSelect;

function toEntry(r: ReviewRecord): ReviewEntry {
  return {
    id: r.id,
    sender: r.sender,
    initials: r.initials,
    address: r.address,
    volume: r.volume,
    action: r.action,
    deleteCount: r.deleteCount ?? undefined,
    confidence: r.confidence,
    reason: r.reason,
    hasDetail: r.hasDetail,
    decision: r.decision,
  };
}

function toRow(r: RowRecord): ActivityRow & { messageIds?: string[] } {
  return {
    id: r.id,
    sender: r.sender,
    action: r.action,
    why: r.why,
    decidedBy: r.decidedBy,
    confidence: r.confidence ?? undefined,
    kind: r.kind,
    restored: r.restored,
    dryRun: r.dryRun,
    messageIds: r.messageIds ?? undefined,
  };
}

function withoutIds({
  messageIds: _ids,
  ...row
}: ActivityRow & { messageIds?: string[] }): ActivityRow {
  return row;
}

/** SQLite (libSQL) store for a real, non-demo instance. */
export class DbStore implements Store {
  constructor(private db: Db) {}

  private async settingsRow() {
    const row = await this.db.select().from(settings).where(eq(settings.id, 1)).get();
    if (row) return row;
    const created = {
      id: 1,
      rules: fixtures.defaultRules,
      lastRunAt: null,
      lastRunStats: null,
      sessionGeneration: 0,
    };
    await this.db.insert(settings).values(created).onConflictDoNothing();
    return created;
  }

  async getRules() {
    return (await this.settingsRow()).rules;
  }

  async saveRules(rules: Rules) {
    await this.settingsRow();
    await this.db.update(settings).set({ rules }).where(eq(settings.id, 1));
    return rules;
  }

  async getSummary() {
    const row = await this.settingsRow();
    const pending = await this.db.select().from(reviewItems).where(isNull(reviewItems.decision));
    return {
      lastRunAt: row.lastRunAt,
      // The scheduler owns next-run time; the route fills it in.
      nextRunAt: null,
      autoUnsubscribed: row.lastRunStats?.autoUnsubscribed ?? 0,
      movedToTrash: row.lastRunStats?.movedToTrash ?? 0,
      needsReview: pending.length,
      protectedCount: row.lastRunStats?.protectedCount ?? 0,
    };
  }

  async setLastRun(at: Date, stats: LastRunStats) {
    await this.settingsRow();
    await this.db
      .update(settings)
      .set({ lastRunAt: at.toISOString(), lastRunStats: stats })
      .where(eq(settings.id, 1));
  }

  async listReview() {
    const rows = await this.db.select().from(reviewItems).orderBy(reviewItems.createdAt);
    return rows.map(toEntry);
  }

  async getReviewItem(id: string) {
    const row = await this.db.select().from(reviewItems).where(eq(reviewItems.id, id)).get();
    return row ? toEntry(row) : undefined;
  }

  async listRecentEmails(_id: string) {
    // Live mode does not store per-email detail yet.
    return [];
  }

  async replacePendingReview(items: PendingReview[]) {
    const now = new Date().toISOString();
    await this.db.transaction(async (tx) => {
      await tx.delete(reviewItems).where(isNull(reviewItems.decision));
      for (const { item, payload } of items) {
        const { signals: _signals, ...rest } = item;
        const values = {
          ...rest,
          deleteCount: item.deleteCount ?? null,
          hasDetail: item.hasDetail ?? false,
          payload,
          decision: null,
          decidedAt: null,
        };
        await tx
          .insert(reviewItems)
          .values({ ...values, createdAt: now })
          .onConflictDoUpdate({ target: reviewItems.id, set: values });
      }
    });
  }

  async setDecision(id: string, decision: ReviewEntry["decision"]) {
    await this.db
      .update(reviewItems)
      .set({ decision, decidedAt: decision ? new Date().toISOString() : null })
      .where(eq(reviewItems.id, id));
    return this.getReviewItem(id);
  }

  async getPayload(id: string) {
    const row = await this.db.select().from(reviewItems).where(eq(reviewItems.id, id)).get();
    return row?.payload;
  }

  async setPayload(id: string, payload: ActionPayload) {
    await this.db.update(reviewItems).set({ payload }).where(eq(reviewItems.id, id));
  }

  async listActivity(): Promise<ActivityRun[]> {
    const runs = await this.db.select().from(activityRuns).orderBy(desc(activityRuns.createdAt));
    return Promise.all(
      runs.map(async (run) => {
        const rows = await this.db
          .select()
          .from(activityRows)
          .where(eq(activityRows.runId, run.id))
          .orderBy(activityRows.createdAt);
        return {
          id: run.id,
          title: run.title,
          summary: run.summary,
          rows: rows.map((r) => withoutIds(toRow(r))),
        };
      }),
    );
  }

  async recordRun(run: { title: string; summary: string; rows: NewActivityRow[] }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.db.transaction(async (tx) => {
      await tx
        .insert(activityRuns)
        .values({ id, title: run.title, summary: run.summary, createdAt: now });
      for (const row of run.rows) {
        await tx.insert(activityRows).values({
          id: randomUUID(),
          runId: id,
          sender: row.sender,
          action: row.action,
          why: row.why,
          decidedBy: row.decidedBy,
          confidence: row.confidence ?? null,
          kind: row.kind,
          messageIds: row.messageIds ?? null,
          dryRun: row.dryRun ?? false,
          createdAt: now,
        });
      }
    });
    return id;
  }

  async getActivityRow(id: string) {
    const row = await this.db.select().from(activityRows).where(eq(activityRows.id, id)).get();
    return row ? toRow(row) : undefined;
  }

  async markRestored(id: string) {
    await this.db.update(activityRows).set({ restored: true }).where(eq(activityRows.id, id));
    const row = await this.getActivityRow(id);
    return row ? withoutIds(row) : undefined;
  }

  async recordKeep(address: string) {
    await this.db
      .insert(senderFeedback)
      .values({
        address: address.toLowerCase(),
        verdict: "keep",
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing();
  }

  async keptSenders() {
    const rows = await this.db.select().from(senderFeedback);
    return rows.map((r) => r.address);
  }

  async getSessionGeneration() {
    return (await this.settingsRow()).sessionGeneration;
  }

  async bumpSessionGeneration() {
    await this.settingsRow();
    const row = await this.db
      .update(settings)
      .set({ sessionGeneration: sql`${settings.sessionGeneration} + 1` })
      .where(eq(settings.id, 1))
      .returning({ sessionGeneration: settings.sessionGeneration })
      .get();
    return row.sessionGeneration;
  }
}
