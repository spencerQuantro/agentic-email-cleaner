import type { ProtectedCategory, Rules } from "@sweep/shared";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { rulesQuery, useSaveRules } from "../lib/queries";
import { normalizeSender } from "../lib/senders";

export const Route = createFileRoute("/rules")({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(rulesQuery),
  component: RulesPage,
});

type SwitchKey = "autoUnsubscribe" | "autoDelete" | "dryRun";

const switches: { key: SwitchKey; label: string; hint: string }[] = [
  {
    key: "autoUnsubscribe",
    label: "Auto-unsubscribe",
    hint: "Uses the sender's one-click unsubscribe link when available.",
  },
  {
    key: "autoDelete",
    label: "Auto-delete",
    hint: "Moves bulk mail it's confident about to Trash.",
  },
  { key: "dryRun", label: "Dry run", hint: "Show what Sweep would do, but don't take any action." },
];

const categories: { key: ProtectedCategory; label: string }[] = [
  { key: "receipts", label: "Receipts & orders" },
  { key: "finance", label: "Banks, bills & statements" },
  { key: "travel", label: "Travel & bookings" },
  { key: "security", label: "Security & account alerts" },
  { key: "people", label: "People you've emailed" },
  { key: "starred", label: "Starred & Important" },
];

const schedules: { value: Rules["schedule"]; label: string }[] = [
  { value: "daily", label: "Daily at 6:00 AM" },
  { value: "weekly", label: "Weekly on Sunday" },
  { value: "manual", label: "Only when I run it" },
];

function thresholdHint(threshold: number) {
  if (threshold >= 98) {
    return "Very cautious: only the most obvious junk is handled automatically. Expect a longer review queue.";
  }
  if (threshold >= 93) {
    return "Balanced: clear-cut promos are handled automatically, anything ambiguous comes to you.";
  }
  return "Aggressive: Sweep acts more often on its own. Check Activity regularly.";
}

type SaveStatus = { state: "idle" | "saving" | "saved" } | { state: "error"; message: string };

const statusText = {
  idle: "Changes save automatically",
  saving: "Saving…",
  saved: "Saved",
};

const field = "min-h-11 rounded-lg border border-border-strong bg-surface px-3 text-sm";

/**
 * Rules and safety (docs/designs/Rules.dc.html). Every control autosaves the
 * whole Rules object: switches, toggles, senders and the schedule as soon as
 * they change, the slider on release. Controls update optimistically; each
 * save builds on the latest local rules, and a failed save puts every control
 * back to the last rules the server confirmed. The header shows save status.
 */
function RulesPage() {
  const { data: confirmed } = useSuspenseQuery(rulesQuery);
  const queryClient = useQueryClient();
  const save = useSaveRules();
  const [rules, setRules] = useState(confirmed);
  // The newest local rules, including changes whose save hasn't finished yet.
  const latest = useRef(confirmed);
  const inFlight = useRef(0);
  const [status, setStatus] = useState<SaveStatus>({ state: "idle" });
  // Track the slider locally and save once the user lets go, not on every step.
  const [threshold, setThreshold] = useState(confirmed.threshold);
  const [newSender, setNewSender] = useState("");
  const [senderError, setSenderError] = useState<string | null>(null);

  const update = async (patch: Partial<Rules>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setRules(next);
    setStatus({ state: "saving" });
    inFlight.current += 1;
    try {
      const saved = await save.mutateAsync(next);
      inFlight.current -= 1;
      if (inFlight.current === 0) {
        latest.current = saved;
        setRules(saved);
        setStatus({ state: "saved" });
      }
    } catch (error) {
      inFlight.current -= 1;
      // useSaveRules only writes successful saves to the cache, so it holds the last confirmed rules.
      const last = queryClient.getQueryData(rulesQuery.queryKey)!;
      latest.current = last;
      setRules(last);
      setThreshold(last.threshold);
      setStatus({ state: "error", message: (error as Error).message });
    }
  };

  const commitThreshold = () => {
    if (threshold !== latest.current.threshold) void update({ threshold });
  };

  const addSender = () => {
    const result = normalizeSender(newSender, latest.current.protectedSenders);
    if (!result.ok) {
      setSenderError(result.error);
      return;
    }
    void update({ protectedSenders: [...latest.current.protectedSenders, result.value] });
    setNewSender("");
  };

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-5">
      <PageHeader
        title="Rules & safety"
        description="Decide how sure Sweep needs to be before it acts on its own, and what it should never touch."
        actions={
          <p
            role="status"
            className={`text-[13px] ${status.state === "error" ? "text-danger-ink" : "text-muted"}`}
          >
            {status.state === "error"
              ? `Couldn't save: ${status.message}`
              : statusText[status.state]}
          </p>
        }
      />

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">Auto-act threshold</h2>
        <p className="mt-1 mb-4 text-muted">
          Below this, suggestions go to your review queue instead.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label htmlFor="threshold" className="min-w-[180px] font-medium">
            Act when at least
          </label>
          <input
            id="threshold"
            type="range"
            min={80}
            max={100}
            step={1}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            onPointerUp={commitThreshold}
            onKeyUp={commitThreshold}
            className="h-11 flex-[1_1_240px] accent-primary"
          />
          <span className="min-w-16 text-right font-display text-2xl font-semibold">
            {threshold}%
          </span>
        </div>
        <p className="mt-3 rounded-lg bg-fill-muted px-3 py-2.5 text-[13px] text-ink-2">
          {thresholdHint(threshold)}
        </p>
      </section>

      <section className="rounded-xl border border-border bg-surface px-5 py-2">
        <h2 className="mt-3 mb-1 text-base font-semibold">What Sweep can do on its own</h2>
        {switches.map(({ key, label, hint }) => (
          <div
            key={key}
            className="flex items-center justify-between gap-4 border-t border-divider py-3"
          >
            <div>
              <div className="font-semibold">{label}</div>
              <div className="text-[13px] text-muted">{hint}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={rules[key]}
              aria-label={label}
              onClick={() => void update({ [key]: !latest.current[key] })}
              className="flex h-11 flex-[0_0_52px] items-center"
            >
              <span
                className={`flex h-[30px] w-[52px] items-center rounded-full p-[3px] ${
                  rules[key] ? "justify-end bg-primary" : "justify-start bg-switch-off"
                }`}
              >
                <span className="size-6 rounded-full bg-white" />
              </span>
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2.5 border-t border-divider py-3 text-[13px] font-medium text-safe-ink">
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
          </svg>
          Permanent delete is not available. Everything goes to Gmail Trash (30-day restore).
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">Always protected</h2>
        <p className="mt-1 mb-4 text-muted">
          Sweep never deletes these or unsubscribes from them, and won't suggest it either.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {categories.map(({ key, label }) => {
            const on = rules.protectedCategories[key];
            return (
              <button
                key={key}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() =>
                  void update({
                    protectedCategories: {
                      ...latest.current.protectedCategories,
                      [key]: !latest.current.protectedCategories[key],
                    },
                  })
                }
                className={`flex min-h-12 items-center gap-2.5 rounded-[10px] border px-3.5 text-left font-medium ${
                  on ? "border-primary bg-primary-softer" : "border-border-strong bg-surface"
                }`}
              >
                {on ? (
                  <span
                    aria-hidden="true"
                    className="flex size-5 flex-none items-center justify-center rounded-[5px] bg-primary"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-white"
                    >
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className="size-5 flex-none rounded-[5px] border-2 border-muted-2"
                  />
                )}
                {label}
              </button>
            );
          })}
        </div>

        <h3 className="mt-5 mb-2 font-semibold">Protected senders</h3>
        <div className="flex flex-wrap items-center gap-2">
          {rules.protectedSenders.map((sender) => (
            <span
              key={sender}
              className="inline-flex items-center gap-1.5 rounded-full bg-fill-muted py-1.5 pr-1.5 pl-3 text-[13px]"
            >
              {sender}
              <button
                type="button"
                aria-label={`Remove ${sender}`}
                onClick={() =>
                  void update({
                    protectedSenders: latest.current.protectedSenders.filter((s) => s !== sender),
                  })
                }
                className="relative size-7 rounded-full text-muted before:absolute before:-inset-2"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <label htmlFor="newsender" className="sr-only">
            Add a protected sender or domain
          </label>
          <input
            id="newsender"
            type="text"
            placeholder="name@example.com or example.com"
            value={newSender}
            onChange={(e) => {
              setNewSender(e.target.value);
              setSenderError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") addSender();
            }}
            aria-invalid={senderError ? true : undefined}
            aria-describedby={senderError ? "newsender-error" : undefined}
            className={`${field} min-w-0 flex-[1_1_280px]`}
          />
          <button type="button" onClick={addSender} className={`${field} px-4 font-medium`}>
            Add
          </button>
        </div>
        {senderError && (
          <p id="newsender-error" className="mt-2 text-[13px] text-danger-ink">
            {senderError}
          </p>
        )}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-5">
        <div>
          <h2 className="text-base font-semibold">Schedule</h2>
          <p className="mt-1 text-muted">Scans new mail and anything left from earlier runs.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="schedule" className="font-medium">
            Run
          </label>
          <select
            id="schedule"
            value={rules.schedule}
            onChange={(e) => void update({ schedule: e.target.value as Rules["schedule"] })}
            className={field}
          >
            {schedules.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </section>
    </div>
  );
}
