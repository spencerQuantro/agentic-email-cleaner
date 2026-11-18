import type { Decision, Rules } from "@sweep/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export const sessionQuery = queryOptions({ queryKey: ["session"], queryFn: api.session });
export const summaryQuery = queryOptions({ queryKey: ["summary"], queryFn: api.summary });
export const reviewQuery = queryOptions({ queryKey: ["review"], queryFn: api.review });
export const reviewItemQuery = (id: string) =>
  queryOptions({ queryKey: ["review", id], queryFn: () => api.reviewItem(id) });
export const recentEmailsQuery = (id: string) =>
  queryOptions({ queryKey: ["review", id, "emails"], queryFn: () => api.recentEmails(id) });
export const activityQuery = queryOptions({ queryKey: ["activity"], queryFn: api.activity });
export const rulesQuery = queryOptions({ queryKey: ["rules"], queryFn: api.rules });

/** Approve/keep and undo touch the queue, the summary counts, and the activity log. */
function useInvalidateReview() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [["review"], ["summary"], ["activity"]].map((queryKey) => qc.invalidateQueries({ queryKey })),
    );
}

export function useDecide() {
  const invalidate = useInvalidateReview();
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: Decision }) => api.decide(id, decision),
    onSettled: invalidate,
  });
}

export function useUndo() {
  const invalidate = useInvalidateReview();
  return useMutation({ mutationFn: api.undo, onSettled: invalidate });
}

export function useRestore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.restore,
    onSettled: () => qc.invalidateQueries({ queryKey: ["activity"] }),
  });
}

export function useSaveRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules: Rules) => api.saveRules(rules),
    onSuccess: (rules) => qc.setQueryData(rulesQuery.queryKey, rules),
  });
}
