import {
  ActivityRow,
  ActivityRun,
  Decision,
  ReviewItem,
  Rules,
  RunSummary,
  Session,
} from "@sweep/shared";
import { z } from "zod";

export const ReviewEntry = ReviewItem.extend({ decision: Decision.nullable() });
export type ReviewEntry = z.infer<typeof ReviewEntry>;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Fetches JSON and validates it against the shared schema, so UI types are never a guess. */
async function request<T>(schema: z.ZodType<T>, path: string, init?: RequestInit): Promise<T> {
  // Absolute URL so the same code works in the browser and under jsdom in tests.
  const res = await fetch(new URL(`/api${path}`, window.location.origin), {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return schema.parse(body);
}

export const api = {
  session: () => request(Session, "/session"),
  summary: () => request(RunSummary, "/summary"),
  review: () => request(z.array(ReviewEntry), "/review"),
  reviewItem: (id: string) => request(ReviewEntry, `/review/${encodeURIComponent(id)}`),
  decide: (id: string, decision: Decision) =>
    request(ReviewEntry, `/review/${encodeURIComponent(id)}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
  undo: (id: string) =>
    request(ReviewEntry, `/review/${encodeURIComponent(id)}/decision`, { method: "DELETE" }),
  activity: () => request(z.array(ActivityRun), "/activity"),
  restore: (rowId: string) =>
    request(ActivityRow, `/activity/${encodeURIComponent(rowId)}/restore`, { method: "POST" }),
  rules: () => request(Rules, "/rules"),
  saveRules: (rules: Rules) =>
    request(Rules, "/rules", { method: "PUT", body: JSON.stringify(rules) }),
};
