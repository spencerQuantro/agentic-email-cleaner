import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { rulesQuery, useSaveRules } from "../lib/queries";

export const Route = createFileRoute("/rules")({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(rulesQuery),
  component: RulesPage,
});

/**
 * Rules and safety. Match docs/designs/Rules.dc.html: threshold slider with
 * hint, switches, protected-category toggles, protected senders, schedule.
 */
function RulesPage() {
  const { data: rules } = useSuspenseQuery(rulesQuery);
  const save = useSaveRules();
  // Track the slider locally and save once the user lets go, not on every step.
  const [threshold, setThreshold] = useState(rules.threshold);
  const commit = () => {
    if (threshold !== rules.threshold) save.mutate({ ...rules, threshold });
  };

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-5">
      <PageHeader
        title="Rules & safety"
        description="Decide how sure Sweep needs to be before it acts on its own, and what it should never touch."
      />
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">Auto-act threshold</h2>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label htmlFor="threshold" className="min-w-[180px] font-medium">
            Act when at least
          </label>
          <input
            id="threshold"
            type="range"
            min={80}
            max={100}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            onPointerUp={commit}
            onKeyUp={commit}
            className="h-11 flex-[1_1_240px] accent-primary"
          />
          <span className="min-w-16 text-right font-display text-2xl font-semibold">
            {threshold}%
          </span>
        </div>
      </section>
    </div>
  );
}
