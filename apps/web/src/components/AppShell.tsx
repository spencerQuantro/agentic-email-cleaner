import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { sessionQuery, summaryQuery } from "../lib/queries";

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-2 pb-5">
      <svg
        aria-hidden="true"
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </svg>
      <span className="font-display text-xl font-semibold">Sweep</span>
    </div>
  );
}

const navLink =
  "flex min-h-11 items-center justify-between rounded-lg px-3 text-ink-2 no-underline hover:text-ink";
const navActive = "bg-primary-soft font-semibold text-primary-ink hover:text-primary-ink";

/** Sidebar + content layout shared by every screen (see docs/designs). */
export function AppShell({ children }: { children: ReactNode }) {
  const { data: summary } = useQuery(summaryQuery);
  const { data: session } = useQuery(sessionQuery);

  return (
    <div className="flex min-h-screen flex-wrap">
      <nav
        aria-label="Main"
        className="flex flex-[1_1_200px] flex-col gap-1 border-r border-border bg-surface px-4 py-6"
      >
        <Logo />
        <Link
          to="/review"
          className={navLink}
          activeProps={{ className: navActive, "aria-current": "page" }}
        >
          Review
          {summary && summary.needsReview > 0 && (
            <span className="rounded-full bg-review-ink-2 px-2 py-px text-xs text-white">
              {summary.needsReview}
            </span>
          )}
        </Link>
        <Link
          to="/activity"
          className={navLink}
          activeProps={{ className: navActive, "aria-current": "page" }}
        >
          Activity
        </Link>
        <Link
          to="/rules"
          className={navLink}
          activeProps={{ className: navActive, "aria-current": "page" }}
        >
          Rules &amp; safety
        </Link>
        <div className="mt-auto border-t border-border px-3 pt-4 text-[13px] text-muted">
          {session?.connected ? (
            <>
              Connected to
              <br />
              <span className="font-medium text-ink">{session.email}</span>
              {session.mode === "demo" && <span className="mt-1 block">Demo mode</span>}
            </>
          ) : (
            <a href="/auth/google" className="font-medium">
              Connect Gmail
            </a>
          )}
        </div>
      </nav>

      <main className="min-w-0 flex-[999_1_560px] px-10 pt-8 pb-12">{children}</main>
    </div>
  );
}
