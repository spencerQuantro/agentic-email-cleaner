import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Rules } from "@sweep/shared";

/** Single-row settings table (id is always 1). */
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  rules: text("rules", { mode: "json" }).$type<Rules>().notNull(),
  lastRunAt: text("last_run_at"),
  lastRunStats: text("last_run_stats", { mode: "json" }).$type<LastRunStats>(),
});

export interface ReviewPayload {
  messageIds: string[];
  unsubscribeUrl?: string;
  oneClickUnsubscribe: boolean;
}

export interface LastRunStats {
  autoUnsubscribed: number;
  movedToTrash: number;
  protectedCount: number;
}

/** Senders Sweep wasn't sure about, plus the user's decision once made. */
export const reviewItems = sqliteTable("review_items", {
  id: text("id").primaryKey(),
  sender: text("sender").notNull(),
  initials: text("initials").notNull(),
  address: text("address").notNull(),
  volume: text("volume").notNull(),
  action: text("action", { enum: ["unsubscribe", "delete"] }).notNull(),
  deleteCount: text("delete_count"),
  confidence: integer("confidence").notNull(),
  reason: text("reason").notNull(),
  hasDetail: integer("has_detail", { mode: "boolean" }).notNull().default(false),
  /** Message IDs and unsubscribe info needed to act on approval. Server-only. */
  payload: text("payload", { mode: "json" }).$type<ReviewPayload>().notNull(),
  /** null = pending. */
  decision: text("decision", { enum: ["approved", "kept"] }),
  decidedAt: text("decided_at"),
  createdAt: text("created_at").notNull(),
});

export const activityRuns = sqliteTable("activity_runs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  createdAt: text("created_at").notNull(),
});

/** Audit log: every action Sweep takes, automatic or approved. */
export const activityRows = sqliteTable("activity_rows", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => activityRuns.id, { onDelete: "cascade" }),
  sender: text("sender").notNull(),
  action: text("action").notNull(),
  why: text("why").notNull(),
  decidedBy: text("decided_by", { enum: ["auto", "user"] }).notNull(),
  confidence: integer("confidence"),
  kind: text("kind", { enum: ["unsubscribe", "delete"] }).notNull(),
  /** Gmail message IDs moved to Trash, so Restore can move them back. */
  messageIds: text("message_ids", { mode: "json" }).$type<string[]>(),
  restored: integer("restored", { mode: "boolean" }).notNull().default(false),
  dryRun: integer("dry_run", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

/** "Keep" decisions, fed back into future classifications. */
export const senderFeedback = sqliteTable("sender_feedback", {
  address: text("address").primaryKey(),
  verdict: text("verdict", { enum: ["keep"] }).notNull(),
  createdAt: text("created_at").notNull(),
});

/** The Google refresh token, encrypted with TOKEN_ENCRYPTION_KEY. */
export const oauthTokens = sqliteTable("oauth_tokens", {
  id: integer("id").primaryKey(),
  email: text("email").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  updatedAt: text("updated_at").notNull(),
});
