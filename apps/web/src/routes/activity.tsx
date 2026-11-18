import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../components/PageHeader";
import { activityQuery, useRestore } from "../lib/queries";

export const Route = createFileRoute("/activity")({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(activityQuery),
  component: Activity,
});

const chip = "rounded-md px-2 py-0.5 text-xs font-semibold";

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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="px-[18px] py-2.5 font-semibold">
                    Sender
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    Action
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    Why
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    Decided by
                  </th>
                  <th scope="col" className="px-[18px] py-2.5 text-right font-semibold">
                    <span className="sr-only">Undo</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {run.rows.map((row) => (
                  <tr key={row.id} className="border-t border-divider">
                    <td className="px-[18px] py-3 font-semibold whitespace-nowrap">{row.sender}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {row.restored ? (
                        <>
                          <span className="text-muted line-through">{row.action}</span>{" "}
                          <span className="text-xs font-semibold text-safe-ink">Restored</span>
                        </>
                      ) : (
                        <span>{row.action}</span>
                      )}
                      {row.dryRun && (
                        <>
                          {" "}
                          <span className={`${chip} bg-fill-muted text-muted`}>Dry run</span>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3 text-ink-2">{row.why}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {row.decidedBy === "auto" ? (
                        <span className={`${chip} bg-safe-bg text-safe-ink`}>
                          Auto · {row.confidence}%
                        </span>
                      ) : (
                        <span className={`${chip} bg-primary-soft text-primary-ink`}>
                          You approved
                        </span>
                      )}
                    </td>
                    <td className="px-[18px] py-1.5 text-right">
                      {row.kind === "delete" && !row.restored && !row.dryRun && (
                        <button
                          type="button"
                          className="min-h-11 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-medium text-ink"
                          onClick={() => restore.mutate(row.id)}
                        >
                          Restore
                        </button>
                      )}
                      {row.kind === "unsubscribe" && (
                        <span className="text-xs text-muted">Resubscribe at sender</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
