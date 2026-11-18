import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { PageHeader } from "../components/PageHeader";
import type { ReviewEntry } from "../lib/api";
import { reviewQuery, rulesQuery, summaryQuery, useDecide, useUndo } from "../lib/queries";

export const Route = createFileRoute("/review/")({
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(reviewQuery),
      queryClient.ensureQueryData(summaryQuery),
      queryClient.ensureQueryData(rulesQuery),
    ]),
  component: ReviewQueue,
});

type Filter = "all" | ReviewEntry["action"];

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unsubscribe", label: "Unsubscribe" },
  { value: "delete", label: "Delete" },
];

const matches = (entry: ReviewEntry, filter: Filter) => filter === "all" || entry.action === filter;

const DAY_MS = 24 * 60 * 60 * 1000;
const dayWords: Record<number, string> = { [-1]: "yesterday", 0: "today", 1: "tomorrow" };

/** "today, 6:00 AM" within a day of today, otherwise "Nov 20, 6:00 AM" (local time). */
function formatWhen(iso: string, now: Date) {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
  const day =
    dayWords[days] ??
    new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
  return `${day}, ${time}`;
}

function runMeta(lastRunAt: string | null, nextRunAt: string | null) {
  const now = new Date();
  const parts = [
    lastRunAt && `Last run ${formatWhen(lastRunAt, now)}`,
    nextRunAt && `Next run ${formatWhen(nextRunAt, now)}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function resolvedLabel(entry: ReviewEntry) {
  if (entry.decision === "kept") return "kept, and I'll remember this choice";
  if (entry.action === "unsubscribe") return "unsubscribed";
  return entry.deleteCount ? `moved to Trash (${entry.deleteCount})` : "moved to Trash";
}

const disabledLook = "disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = `min-h-11 rounded-lg bg-primary font-semibold text-white ${disabledLook}`;
const chip = "rounded-md px-2 py-0.5 text-xs font-semibold";

/**
 * Review queue (docs/designs/Main.dc.html): run meta, summary cards, filter
 * pills, and pending/resolved rows. Everything shown derives from the review
 * query; per-row errors and in-flight requests are the only local state.
 */
function ReviewQueue() {
  const { data: entries } = useSuspenseQuery(reviewQuery);
  const { data: summary } = useSuspenseQuery(summaryQuery);
  const { data: rules } = useSuspenseQuery(rulesQuery);
  const decide = useDecide();
  const undo = useUndo();
  const [filter, setFilter] = useState<Filter>("all");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [approvingAll, setApprovingAll] = useState(false);

  const pending = entries.filter((entry) => entry.decision === null);
  const visible = entries.filter((entry) => matches(entry, filter));
  const visiblePending = pending.filter((entry) => matches(entry, filter));

  /** Clears the rows' errors and marks them in flight. */
  const start = (ids: string[]) => {
    setErrors((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
    setBusy((prev) => new Set([...prev, ...ids]));
  };

  /** Waits for one row's request, records its error, and frees the row. */
  const settle = async (id: string, request: Promise<unknown>) => {
    try {
      await request;
    } catch (error) {
      setErrors((prev) => ({ ...prev, [id]: (error as Error).message }));
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const act = (id: string, request: () => Promise<unknown>) => {
    start([id]);
    void settle(id, request());
  };

  const approveAll = async () => {
    const ids = visiblePending.map((entry) => entry.id);
    setApprovingAll(true);
    start(ids);
    // One at a time, so irreversible unsubscribes stay ordered; failures don't stop the rest.
    for (const id of ids) {
      await settle(id, decide.mutateAsync({ id, decision: "approved" }));
    }
    setApprovingAll(false);
  };

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-6">
      <PageHeader
        eyebrow={runMeta(summary.lastRunAt, summary.nextRunAt)}
        title="Needs your review"
        description={`Sweep handled everything it was sure about. These senders fell below your ${rules.threshold}% confidence threshold, so nothing happens until you decide.`}
        actions={
          <button
            type="button"
            className={`${primaryButton} px-[18px]`}
            disabled={visiblePending.length === 0 || approvingAll}
            onClick={() => void approveAll()}
          >
            Approve all suggestions ({visiblePending.length})
          </button>
        }
      />

      <section aria-label="Last run summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Auto-unsubscribed" count={summary.autoUnsubscribed} unit="senders">
          <Link to="/activity" className="text-[13px]">
            View activity
          </Link>
        </SummaryCard>
        <SummaryCard label="Moved to Trash" count={summary.movedToTrash} unit="emails">
          <span className="text-[13px] text-muted">Restorable for 30 days</span>
        </SummaryCard>
        <div className="rounded-xl border border-review-border bg-review-bg p-4">
          <div className="text-[13px] text-review-ink-2">Needs review</div>
          <div className="mt-1 font-display text-[28px] font-semibold text-review-ink">
            {pending.length} <span className="text-sm font-medium">senders</span>
          </div>
          <span className="text-[13px] text-review-ink-2">Below {rules.threshold}% confidence</span>
        </div>
        <SummaryCard label="Protected" count={summary.protectedCount} unit="emails">
          <Link to="/rules" className="text-[13px]">
            Receipts, travel, banks…
          </Link>
        </SummaryCard>
      </section>

      <div role="tablist" aria-label="Filter suggestions" className="flex flex-wrap gap-2">
        {filters.map(({ value, label }) => {
          const selected = filter === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setFilter(value)}
              className={`min-h-10 rounded-full border px-3.5 font-medium ${
                selected
                  ? "border-ink bg-ink text-white"
                  : "border-border-strong bg-surface text-ink-2"
              }`}
            >
              {label} · {pending.filter((entry) => matches(entry, value)).length}
            </button>
          );
        })}
      </div>

      <ul className="flex flex-col gap-2.5">
        {visible.map((entry) => (
          <li key={entry.id} className="rounded-xl border border-border bg-surface px-[18px] py-4">
            {entry.decision === null ? (
              <PendingRow
                entry={entry}
                busy={busy.has(entry.id)}
                onKeep={() =>
                  act(entry.id, () => decide.mutateAsync({ id: entry.id, decision: "kept" }))
                }
                onApprove={() =>
                  act(entry.id, () => decide.mutateAsync({ id: entry.id, decision: "approved" }))
                }
              />
            ) : (
              <ResolvedRow
                entry={entry}
                busy={busy.has(entry.id)}
                onUndo={() => act(entry.id, () => undo.mutateAsync(entry.id))}
              />
            )}
            {errors[entry.id] !== undefined ? (
              <p role="alert" className="mt-3 text-danger-ink">
                {errors[entry.id]}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {pending.length === 0 ? (
        <div className="rounded-xl border border-safe-border bg-safe-bg-2 p-8 text-center font-medium text-safe-ink">
          All caught up. Approved actions run now; anything you kept becomes a signal for next time.
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  count,
  unit,
  children,
}: {
  label: string;
  count: number;
  unit: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1 font-display text-[28px] font-semibold">
        {count} <span className="text-sm font-medium text-muted">{unit}</span>
      </div>
      {children}
    </div>
  );
}

function PendingRow({
  entry,
  busy,
  onKeep,
  onApprove,
}: {
  entry: ReviewEntry;
  busy: boolean;
  onKeep: () => void;
  onApprove: () => void;
}) {
  const unsubscribe = entry.action === "unsubscribe";
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div
        aria-hidden="true"
        className="flex h-10 flex-[0_0_40px] items-center justify-center rounded-full bg-primary-avatar text-sm font-semibold text-primary-ink"
      >
        {entry.initials}
      </div>
      <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[15px] font-semibold">{entry.sender}</span>
          <span className="min-w-0 text-[13px] break-words text-muted">
            {entry.address} · {entry.volume}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unsubscribe ? (
            <span className={`${chip} bg-primary-soft text-primary-ink`}>Suggest: Unsubscribe</span>
          ) : (
            <span className={`${chip} bg-danger-bg text-danger-ink`}>
              {entry.deleteCount ? `Suggest: Delete ${entry.deleteCount}` : "Suggest: Delete"}
            </span>
          )}
          <span className={`${chip} bg-review-chip text-review-ink`}>{entry.confidence}% sure</span>
        </div>
        <p className="mt-0.5 text-ink-2">
          <strong className="font-semibold">Why I'm unsure:</strong> {entry.reason}
        </p>
        {entry.hasDetail ? (
          <Link
            to="/review/$senderId"
            params={{ senderId: entry.id }}
            className="self-start text-[13px] font-medium"
          >
            See emails and more options →
          </Link>
        ) : null}
      </div>
      <div className="flex flex-[0_1_auto] flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onKeep}
          className={`min-h-11 rounded-lg border border-border-strong bg-surface px-4 font-medium ${disabledLook}`}
        >
          Keep
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onApprove}
          className={`${primaryButton} px-4`}
        >
          {unsubscribe ? "Unsubscribe" : "Delete"}
        </button>
      </div>
    </div>
  );
}

function ResolvedRow({
  entry,
  busy,
  onUndo,
}: {
  entry: ReviewEntry;
  busy: boolean;
  onUndo: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-safe-ink"
        >
          <path d="M5 12l5 5L20 7" />
        </svg>
        <span className="min-w-0 break-words">
          <strong className="font-semibold">{entry.sender}</strong>{" "}
          <span className="text-muted">— {resolvedLabel(entry)}</span>
        </span>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onUndo}
        className={`min-h-11 rounded-lg bg-transparent px-3.5 font-semibold text-primary ${disabledLook}`}
      >
        Undo
      </button>
    </div>
  );
}
