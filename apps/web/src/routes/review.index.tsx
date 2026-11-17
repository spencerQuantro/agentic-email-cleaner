import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "../components/PageHeader";
import { reviewQuery, summaryQuery, useDecide, useUndo } from "../lib/queries";

export const Route = createFileRoute("/review/")({
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(reviewQuery),
      queryClient.ensureQueryData(summaryQuery),
    ]),
  component: ReviewQueue,
});

/**
 * Review queue. Data and actions are wired; the visual build should match
 * docs/designs/Main.dc.html (summary cards, filter pills, queue rows).
 */
function ReviewQueue() {
  const { data: items } = useSuspenseQuery(reviewQuery);
  const { data: summary } = useSuspenseQuery(summaryQuery);
  const decide = useDecide();
  const undo = useUndo();

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-6">
      <PageHeader
        title="Needs your review"
        description="Sweep handled everything it was sure about. These senders fell below your confidence threshold, so nothing happens until you decide."
      />

      <p className="text-muted">
        {summary.needsReview} waiting · {summary.autoUnsubscribed} auto-unsubscribed ·{" "}
        {summary.movedToTrash} moved to Trash · {summary.protectedCount} protected
      </p>

      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-border bg-surface px-[18px] py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-semibold">
                  {item.sender}{" "}
                  <span className="text-[13px] font-normal text-muted">
                    {item.address} · {item.confidence}% sure
                  </span>
                </p>
                <p className="text-ink-2">{item.reason}</p>
                {item.hasDetail && (
                  <Link
                    to="/review/$senderId"
                    params={{ senderId: item.id }}
                    className="text-[13px] font-medium"
                  >
                    See emails and more options →
                  </Link>
                )}
              </div>
              {item.decision === null ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="min-h-11 rounded-lg border border-border-strong bg-surface px-4 font-medium"
                    onClick={() => decide.mutate({ id: item.id, decision: "kept" })}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-white"
                    onClick={() => decide.mutate({ id: item.id, decision: "approved" })}
                  >
                    {item.action === "unsubscribe" ? "Unsubscribe" : "Delete"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="min-h-11 rounded-lg px-3.5 font-semibold text-primary"
                  onClick={() => undo.mutate(item.id)}
                >
                  Undo ({item.decision})
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {(decide.error ?? undo.error) && (
        <p role="alert" className="text-danger-ink">
          {(decide.error ?? undo.error)?.message}
        </p>
      )}
    </div>
  );
}
