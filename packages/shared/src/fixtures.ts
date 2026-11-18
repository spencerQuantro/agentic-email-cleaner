import type { ActivityRun, RecentEmail, ReviewItem, Rules, RunSummary } from "./schemas";

/**
 * Demo data matching the design mocks in docs/designs.
 * Used by demo mode (SWEEP_DEMO=1), tests, and MSW handlers.
 */

export const defaultRules: Rules = {
  threshold: 95,
  autoUnsubscribe: true,
  autoDelete: true,
  dryRun: false,
  protectedCategories: {
    receipts: true,
    finance: true,
    travel: true,
    security: true,
    people: true,
    starred: true,
  },
  protectedSenders: ["mom@gmail.com", "yourcompany.com", "lincolnpta.org"],
  schedule: "daily",
};

export const reviewItems: ReviewItem[] = [
  {
    id: "delta",
    sender: "Delta Air Lines",
    initials: "DL",
    address: "news@e.delta.com",
    volume: "42 emails / 6 mo",
    action: "unsubscribe",
    confidence: 62,
    hasDetail: true,
    reason:
      "Mostly promos, but the same domain sends your trip confirmations and boarding passes. I can't tell if they're on separate lists.",
    signals: [
      { kind: "for", text: "Has a one-click unsubscribe header (RFC 8058)" },
      { kind: "for", text: "Gmail labels 36 of them Promotions" },
      { kind: "against", text: "Same sender domain as your boarding passes" },
      { kind: "against", text: "You have an upcoming trip in your inbox" },
    ],
  },
  {
    id: "pragmatic",
    sender: "The Pragmatic Engineer",
    initials: "PE",
    address: "pragmaticengineer@substack.com",
    volume: "26 emails / 6 mo",
    action: "unsubscribe",
    confidence: 58,
    reason: "Newsletter, but you opened 9 of the last 12 issues.",
  },
  {
    id: "linkedin",
    sender: "LinkedIn Job Alerts",
    initials: "in",
    address: "jobalerts-noreply@linkedin.com",
    volume: "88 emails / 6 mo",
    action: "unsubscribe",
    confidence: 54,
    reason: "High volume, but you've clicked links in 6 alerts this month.",
  },
  {
    id: "amazon",
    sender: "Amazon shipping",
    initials: "AZ",
    address: "shipment-tracking@amazon.com",
    volume: "64 emails / 6 mo",
    action: "delete",
    deleteCount: "51 older than 90 days",
    confidence: 81,
    reason:
      "Old shipping notices are usually safe to delete, but a few reference orders that may still be returnable.",
  },
  {
    id: "pta",
    sender: "Lincoln Elementary PTA",
    initials: "PT",
    address: "news@lincolnpta.org",
    volume: "19 emails / 6 mo",
    action: "unsubscribe",
    confidence: 47,
    reason: "Bulk mailing list, but you've replied to this sender twice.",
  },
  {
    id: "costco",
    sender: "Costco",
    initials: "CO",
    address: "costco@online.costco.com",
    volume: "37 emails / 6 mo",
    action: "delete",
    deleteCount: "33 promos",
    confidence: 77,
    reason:
      "Promotions are mixed with digital receipts from the same address. I'd keep the 4 receipts.",
  },
  {
    id: "github",
    sender: "GitHub",
    initials: "GH",
    address: "notifications@github.com",
    volume: "212 emails / 6 mo",
    action: "delete",
    deleteCount: "190 older than 30 days",
    confidence: 68,
    reason:
      "Notifications on repos you own, including security alerts I don't want to remove without asking.",
  },
];

/** Recent emails per review item id, for the sender review screen. */
export const recentEmails: Record<string, RecentEmail[]> = {
  delta: [
    { subject: "Check in for your flight to Tokyo", date: "2026-11-12", classification: "trip" },
    {
      subject: "Earn bonus miles on your next getaway",
      date: "2026-11-10",
      classification: "marketing",
    },
    { subject: "Your October SkyMiles summary", date: "2026-11-03", classification: "marketing" },
    { subject: "Your trip confirmation: SLC → HND", date: "2026-10-28", classification: "trip" },
    { subject: "Fall into new destinations", date: "2026-10-24", classification: "marketing" },
    {
      subject: "Important updates to your SkyMiles account",
      date: "2026-10-19",
      classification: "unclear",
    },
    { subject: "Members save more this season", date: "2026-10-15", classification: "marketing" },
  ],
};

export const activityRuns: ActivityRun[] = [
  {
    id: "run-today",
    title: "Today, 6:00 AM",
    summary: "23 unsubscribes · 418 emails to Trash · 7 sent to review",
    rows: [
      {
        id: "t1",
        sender: "Old Navy",
        action: "Unsubscribed",
        why: "Promotions only; unopened in 6 months",
        decidedBy: "auto",
        confidence: 99,
        kind: "unsubscribe",
      },
      {
        id: "t2",
        sender: "Wayfair",
        action: "Moved 64 to Trash",
        why: "Promotions only; no receipts found",
        decidedBy: "auto",
        confidence: 98,
        kind: "delete",
      },
      {
        id: "t3",
        sender: "Medium Daily Digest",
        action: "Unsubscribed",
        why: "Opened 0 of last 60",
        decidedBy: "auto",
        confidence: 98,
        kind: "unsubscribe",
      },
      {
        id: "t4",
        sender: "DoorDash offers",
        action: "Moved 41 to Trash",
        why: "Offer emails; order receipts come from a separate address and were kept",
        decidedBy: "auto",
        confidence: 96,
        kind: "delete",
      },
      {
        id: "t5",
        sender: "Temu",
        action: "Unsubscribed",
        why: "Never opened; no account activity found",
        decidedBy: "auto",
        confidence: 99,
        kind: "unsubscribe",
      },
    ],
  },
  {
    id: "run-yesterday",
    title: "Yesterday, 9:41 PM · your review",
    summary: "3 decisions",
    rows: [
      {
        id: "y1",
        sender: "Target Circle",
        action: "Moved 22 to Trash",
        why: "Promos mixed with receipts; receipts kept",
        decidedBy: "user",
        kind: "delete",
      },
      {
        id: "y2",
        sender: "Morning Brew",
        action: "Unsubscribed",
        why: "Newsletter you opened occasionally",
        decidedBy: "user",
        kind: "unsubscribe",
      },
      {
        id: "y3",
        sender: "Nextdoor",
        action: "Moved 57 to Trash",
        why: "Digest emails older than 30 days",
        decidedBy: "user",
        kind: "delete",
      },
    ],
  },
];

export const runSummary: RunSummary = {
  lastRunAt: "2026-11-17T13:00:00.000Z",
  nextRunAt: "2026-11-18T13:00:00.000Z",
  autoUnsubscribed: 23,
  movedToTrash: 418,
  needsReview: reviewItems.length,
  protectedCount: 61,
};
