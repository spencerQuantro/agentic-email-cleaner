import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../components/PageHeader";
import { activityQuery, useRestore } from "../lib/queries";

export const Route = createFileRoute("/activity")({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(activityQuery),
  component: Activity,
});

/** Activity log. Match docs/designs/Activity.dc.html (run cards with tables). */
function Activity() {
  const { data: runs } = useSuspenseQuery(activityQuery);
  const restore = useRestore();

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-6">
      <PageHeader
        title="Activity"
        description="Everything Sweep did, and why. Deleted emails go to Gmail Trash and can be restored for 30 days. Sweep never deletes anything permanently."
      />
      {runs.map((run) => (
        <section
          key={run.id}
          className="overflow-hidden rounded-xl border border-border bg-surface"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-muted px-[18px] py-3.5">
            <h2 className="text-[15px] font-semibold">{run.title}</h2>
            <span className="text-[13px] text-muted">{run.summary}</span>
          </div>
          <ul>
            {run.rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-divider px-[18px] py-2 first:border-t-0"
              >
                <span>
                  <strong className="font-semibold">{row.sender}</strong> — {row.action}
                  {row.restored && (
                    <span className="ml-2 text-xs font-semibold text-safe-ink">Restored</span>
                  )}
                </span>
                {row.kind === "delete" && !row.restored && (
                  <button
                    type="button"
                    className="min-h-11 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-medium"
                    onClick={() => restore.mutate(row.id)}
                  >
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
