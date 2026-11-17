import { z } from "zod";

/** What Sweep proposes to do with a sender's mail. */
export const SuggestedAction = z.enum(["unsubscribe", "delete"]);
export type SuggestedAction = z.infer<typeof SuggestedAction>;

/** A sender waiting in the review queue because confidence was below the threshold. */
export const ReviewItem = z.object({
  id: z.string(),
  sender: z.string(),
  initials: z.string(),
  address: z.string(),
  /** Human-readable volume, e.g. "42 emails / 6 mo". */
  volume: z.string(),
  action: SuggestedAction,
  /** For delete suggestions, what will be trashed, e.g. "51 older than 90 days". */
  deleteCount: z.string().optional(),
  /** 0–100. */
  confidence: z.number().int().min(0).max(100),
  reason: z.string(),
  hasDetail: z.boolean().optional(),
});
export type ReviewItem = z.infer<typeof ReviewItem>;

export const Decision = z.enum(["approved", "kept"]);
export type Decision = z.infer<typeof Decision>;

export const DecisionRequest = z.object({
  decision: Decision,
});
export type DecisionRequest = z.infer<typeof DecisionRequest>;

export const ActivityRow = z.object({
  id: z.string(),
  sender: z.string(),
  /** e.g. "Unsubscribed" or "Moved 64 to Trash". */
  action: z.string(),
  why: z.string(),
  decidedBy: z.enum(["auto", "user"]),
  /** Present when decidedBy is "auto". */
  confidence: z.number().int().min(0).max(100).optional(),
  kind: SuggestedAction,
  restored: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});
export type ActivityRow = z.infer<typeof ActivityRow>;

export const ActivityRun = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  rows: z.array(ActivityRow),
});
export type ActivityRun = z.infer<typeof ActivityRun>;

export const ProtectedCategory = z.enum([
  "receipts",
  "finance",
  "travel",
  "security",
  "people",
  "starred",
]);
export type ProtectedCategory = z.infer<typeof ProtectedCategory>;

export const Rules = z.object({
  /** Auto-act only at or above this confidence (80–100). */
  threshold: z.number().int().min(80).max(100),
  autoUnsubscribe: z.boolean(),
  autoDelete: z.boolean(),
  dryRun: z.boolean(),
  protectedCategories: z.record(ProtectedCategory, z.boolean()),
  protectedSenders: z.array(z.string()),
  schedule: z.enum(["daily", "weekly", "manual"]),
});
export type Rules = z.infer<typeof Rules>;

/** Structured output Claude returns for one sender. */
export const SenderClassification = z.object({
  action: z.enum(["unsubscribe", "delete", "keep"]),
  confidence: z.number().int().min(0).max(100),
  reason: z.string(),
  signals: z.array(
    z.object({
      kind: z.enum(["for", "against"]),
      text: z.string(),
    }),
  ),
  /** Categories Claude detected in the sample, used to apply protection rules. */
  categories: z.array(ProtectedCategory),
});
export type SenderClassification = z.infer<typeof SenderClassification>;

export const Session = z.object({
  mode: z.enum(["demo", "live"]),
  connected: z.boolean(),
  email: z.string().nullable(),
});
export type Session = z.infer<typeof Session>;

export const RunSummary = z.object({
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  autoUnsubscribed: z.number().int(),
  movedToTrash: z.number().int(),
  needsReview: z.number().int(),
  protectedCount: z.number().int(),
});
export type RunSummary = z.infer<typeof RunSummary>;
