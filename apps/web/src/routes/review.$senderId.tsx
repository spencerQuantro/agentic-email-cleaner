import type { EmailClassification, RecentEmail } from "@sweep/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  recentEmailsQuery,
  reviewItemQuery,
  rulesQuery,
  useDecide,
  useSaveRules,
} from "../lib/queries";

export const Route = createFileRoute("/review/$senderId")({
  loader: ({ context: { queryClient }, params }) =>
    Promise.all([
      queryClient.ensureQueryData(reviewItemQuery(params.senderId)),
      queryClient.ensureQueryData(recentEmailsQuery(params.senderId)),
      queryClient.ensureQueryData(rulesQuery),
    ]),
  component: SenderReview,
});

type Choice = "suggested" | "unsubscribe-delete" | "keep" | "protect";

/**
 * Sender review. Match docs/designs/Detail.dc.html: confidence explainer,
 * four-option choice fieldset, and the recent-emails list.
 */
function SenderReview() {
  const { senderId } = Route.useParams();
  const { data: item } = useSuspenseQuery(reviewItemQuery(senderId));
  const { data: emails } = useSuspenseQuery(recentEmailsQuery(senderId));
  const { data: rules } = useSuspenseQuery(rulesQuery);
  const decide = useDecide();
  const saveRules = useSaveRules();
  const navigate = useNavigate();
  const [choice, setChoice] = useState<Choice>("suggested");

  const pending = decide.isPending || saveRules.isPending;
  const error = decide.error ?? saveRules.error;
  const isUnsubscribe = item.action === "unsubscribe";

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    decide.reset();
    saveRules.reset();
    try {
      if (choice === "protect") {
        const address = item.address.toLowerCase();
        const already = rules.protectedSenders.some((s) => s.toLowerCase() === address);
        if (!already) {
          await saveRules.mutateAsync({
            ...rules,
            protectedSenders: [...rules.protectedSenders, item.address],
          });
        }
      }
      await decide.mutateAsync({
        id: item.id,
        decision: choice === "suggested" ? "approved" : "kept",
      });
      await navigate({ to: "/review" });
    } catch {
      // The failed mutation's error is rendered below.
    }
  }

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-6">
      <Link to="/review" className="font-medium no-underline">
        ← Back to review queue
      </Link>

      <header className="flex items-center gap-4">
        <div
          aria-hidden="true"
          className="flex h-14 flex-[0_0_56px] items-center justify-center rounded-full bg-primary-avatar text-[18px] font-semibold text-primary-ink"
        >
          {item.initials}
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-[30px] font-semibold">{item.sender}</h1>
          <p className="mt-0.5 text-muted">
            {item.address} · {item.volume}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Decision" className="flex min-w-0 flex-[1_1_440px] flex-col gap-4">
          <div className="rounded-xl border border-review-border bg-review-bg p-[18px] text-review-ink">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[16px] font-semibold">
                {item.confidence}% sure you can {isUnsubscribe ? "unsubscribe" : "delete these"}
              </h2>
              <span className="text-[12px] font-semibold text-review-ink-2">
                Auto-act threshold: {rules.threshold}%
              </span>
            </div>
            <p className="mt-2">{item.reason}</p>
            {item.signals && item.signals.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1.5 text-[13px]">
                {item.signals.map((signal) => (
                  <li key={signal.text}>
                    {signal.kind === "for" ? "+" : "−"} {signal.text}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {item.decision !== null ? (
            <p className="text-ink-2">
              {item.decision === "approved"
                ? "You already approved this."
                : "You already kept this sender."}
            </p>
          ) : null}

          <form onSubmit={apply}>
            <fieldset
              disabled={item.decision !== null}
              className="m-0 rounded-xl border border-border bg-surface px-[18px] pt-2 pb-[18px]"
            >
              <legend className="px-1.5 text-[15px] font-semibold">What should I do?</legend>
              <div className="flex flex-col gap-2">
                <ChoiceOption
                  value="suggested"
                  choice={choice}
                  onChoose={setChoice}
                  title={
                    isUnsubscribe
                      ? "Unsubscribe from marketing only"
                      : item.deleteCount
                        ? `Delete ${item.deleteCount}`
                        : "Delete these emails"
                  }
                  badge
                  description={
                    isUnsubscribe
                      ? "Keep trip emails. I'll flag it if they stop arriving."
                      : "Moved to Trash, restorable for 30 days."
                  }
                />
                <ChoiceOption
                  value="unsubscribe-delete"
                  choice={choice}
                  onChoose={setChoice}
                  disabled
                  title="Unsubscribe and delete the marketing emails"
                  description="Not available yet."
                />
                <ChoiceOption
                  value="keep"
                  choice={choice}
                  onChoose={setChoice}
                  title="Keep everything for now"
                  description="I'll ask again if the pattern changes."
                />
                <ChoiceOption
                  value="protect"
                  choice={choice}
                  onChoose={setChoice}
                  title="Always protect this sender"
                  description={`Adds ${item.address} to protected senders in Rules.`}
                />
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Link
                  to="/review"
                  className="inline-flex min-h-11 items-center rounded-lg border border-border-strong bg-surface px-4 font-medium text-ink no-underline"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={pending}
                  className="min-h-11 rounded-lg bg-primary px-[18px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Apply
                </button>
              </div>
              {error ? (
                <p role="alert" className="mt-3 text-danger-ink">
                  {error.message}
                </p>
              ) : null}
            </fieldset>
          </form>
        </section>

        <RecentEmailsCard emails={emails} address={item.address} />
      </div>
    </div>
  );
}

function ChoiceOption({
  value,
  choice,
  onChoose,
  title,
  description,
  badge = false,
  disabled = false,
}: {
  value: Choice;
  choice: Choice;
  onChoose: (value: Choice) => void;
  title: string;
  description: string;
  badge?: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex min-h-11 items-start gap-3 rounded-[10px] border border-border p-3 has-[:checked]:border-2 has-[:checked]:border-primary has-[:checked]:bg-primary-softer ${
        disabled ? "cursor-default opacity-50" : "cursor-pointer"
      }`}
    >
      <input
        type="radio"
        name="choice"
        value={value}
        checked={choice === value}
        disabled={disabled}
        onChange={() => onChoose(value)}
        className="mt-[3px] size-[18px] shrink-0"
      />
      <span>
        <span className="block font-semibold">
          {title}
          {badge ? (
            <span className="ml-1 rounded-md bg-primary-avatar px-1.5 py-px text-[12px] font-semibold text-primary-ink">
              Suggested
            </span>
          ) : null}
        </span>
        <span className="block text-[13px] text-muted">{description}</span>
      </span>
    </label>
  );
}

const tagStyles: Record<EmailClassification, { label: string; className: string }> = {
  trip: { label: "Trip", className: "bg-safe-bg text-safe-ink" },
  marketing: { label: "Marketing", className: "bg-fill-muted text-ink-2" },
  unclear: { label: "Unclear", className: "bg-review-chip text-review-ink" },
};

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function RecentEmailsCard({ emails, address }: { emails: RecentEmail[]; address: string }) {
  const gmailUrl = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`from:${address}`)}`;

  return (
    <section
      aria-label="Recent emails from this sender"
      className="min-w-0 flex-[1_1_400px] overflow-hidden rounded-xl border border-border bg-surface"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-[18px] py-3.5">
        <h2 className="text-[15px] font-semibold">Recent emails</h2>
        <span className="text-[13px] text-muted">How I classified each</span>
      </div>
      {emails.length > 0 ? (
        <ul>
          {emails.map((email) => {
            const tag = tagStyles[email.classification];
            return (
              <li
                key={`${email.date}-${email.subject}`}
                className="flex items-center gap-3 border-b border-divider px-[18px] py-3 last:border-b-0"
              >
                <span
                  className={`flex-[0_0_72px] rounded-md py-0.5 text-center text-[12px] font-semibold ${tag.className}`}
                >
                  {tag.label}
                </span>
                <span className="min-w-0 flex-[1_1_auto]">{email.subject}</span>
                <span className="text-[13px] whitespace-nowrap text-muted">
                  {dateFormat.format(new Date(email.date))}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-[18px] py-3 text-muted">No recent emails to show yet.</p>
      )}
      <div className="border-t border-border px-[18px] py-3">
        <a
          href={gmailUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] font-medium"
        >
          Open all in Gmail ↗
        </a>
      </div>
    </section>
  );
}
