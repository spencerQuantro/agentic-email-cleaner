# Sweep — Design Handoff

Build spec for **Sweep**, a Claude-powered Gmail cleanup tool. The source design files are in `docs/designs/`. Build the UI so it matches them exactly.

## How to use this package

- `docs/designs/*.dc.html` are the **source of truth**. Every color, size, spacing, radius and font weight is written as an inline `style="…"` on the element. Copy those values exactly. Don't round them to the nearest Tailwind default when the value differs.
- This document explains the template syntax, lists the design tokens and components, and covers behavior that you can't see in a static file.
- If this document and a design file disagree, the design file wins.

### Reading the `.dc.html` template syntax

The files use a small template language. To translate it to React:

| In the design file                                     | In React                                                                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `{{value}}`                                            | `{value}`                                                                                                         |
| `<sc-for list="{{items}}" as="item">…</sc-for>`        | `items.map(item => …)`                                                                                            |
| `<sc-if value="{{cond}}">…</sc-if>`                    | `{cond && …}`                                                                                                     |
| `onClick="{{handler}}"`                                | `onClick={handler}`                                                                                               |
| `class Component extends DCLogic { renderVals() {…} }` | Component state and derived values. The sample data arrays (`SWEEP_ITEMS`, `SWEEP_RUNS`) are the mock data shape. |
| `<x-dc>`, `<helmet>`, `support.js`, `data-props`       | Design-tool wrappers. Ignore them.                                                                                |
| `hint-placeholder-*` attributes                        | Ignore.                                                                                                           |

Two `<sc-if>` blocks with opposite conditions (e.g. `tab.selected` / `tab.unselected`) are one element with two style variants. Build each as a single component with a variant prop or conditional classes.

## Target stack

React + Vite + TypeScript, Tailwind CSS, TanStack Router (one route per screen), TanStack Query for data. This is already scaffolded in `apps/web`:

- The color and font tokens below are defined in `apps/web/src/styles.css` as Tailwind theme values (`bg-surface`, `text-muted`, `bg-review-bg`, `font-display`, …). Use those names instead of raw hex.
- Each route file already loads its data and wires its actions through `apps/web/src/lib/queries.ts`. The remaining work is the visual build.
- Run `pnpm dev:demo` to work against the server's demo data (the same fixtures as the mocks).

Routes:

| Route                          | Design file        | Screen                                             |
| ------------------------------ | ------------------ | -------------------------------------------------- |
| `/review` (`/` redirects here) | `Main.dc.html`     | Review queue                                       |
| `/review/$senderId`            | `Detail.dc.html`   | Sender review (designed with Delta as the example) |
| `/activity`                    | `Activity.dc.html` | Activity log and restore                           |
| `/rules`                       | `Rules.dc.html`    | Rules and safety settings                          |

## Design tokens

### Color

| Token            | Hex       | Used for                                         |
| ---------------- | --------- | ------------------------------------------------ |
| `bg`             | `#F6F6F3` | Page background                                  |
| `surface`        | `#FFFFFF` | Cards, nav, table sections                       |
| `surface-muted`  | `#FAFAF8` | Table section header rows                        |
| `fill-muted`     | `#F4F4F2` | Neutral chips, hint boxes, "Marketing" tags      |
| `border`         | `#E4E4E0` | Card and nav borders                             |
| `border-strong`  | `#D4D4CF` | Secondary buttons, inputs, unselected pills      |
| `divider`        | `#F0F0EC` | Row dividers inside cards                        |
| `ink`            | `#18181B` | Primary text, selected pill                      |
| `ink-2`          | `#3F3F46` | Body text in rows, inactive nav                  |
| `muted`          | `#52525B` | Secondary text and meta                          |
| `muted-2`        | `#71717A` | Empty checkbox border                            |
| `switch-off`     | `#A1A1AA` | Off switch track                                 |
| `primary`        | `#1D4ED8` | Primary buttons, links, focus ring, on switch    |
| `primary-ink`    | `#1E3A8A` | Link hover, active nav text, chip text           |
| `primary-soft`   | `#EEF2FF` | Active nav background, "Unsubscribe" chip        |
| `primary-softer` | `#F5F7FF` | Selected option card background                  |
| `primary-avatar` | `#E0E7FF` | Avatar circle background, "Suggested" badge      |
| `review-bg`      | `#FFFBEB` | "Needs review" card, confidence explainer        |
| `review-border`  | `#FCD34D` | Same                                             |
| `review-chip`    | `#FEF3C7` | "% sure" chip, "Unclear" tag                     |
| `review-ink`     | `#78350F` | Text on amber backgrounds                        |
| `review-ink-2`   | `#92400E` | Secondary amber text, nav count badge background |
| `danger-bg`      | `#FEE2E2` | "Delete" suggestion chip                         |
| `danger-ink`     | `#991B1B` | Same                                             |
| `safe-bg`        | `#DCFCE7` | "Auto · 99%" chip, "Trip" tag                    |
| `safe-bg-2`      | `#F0FDF4` | "All caught up" banner                           |
| `safe-border`    | `#BBF7D0` | Same                                             |
| `safe-ink`       | `#166534` | Green text and icons                             |

Meaning: blue means actions and selection, amber means "needs your decision", green means "done, safe or protected", and red is used only for the destructive "Delete" suggestion chip.

### Typography

- **Body:** Inter 400/500/600. Base size `14px`, line-height `1.45`.
- **Headings and numbers:** Space Grotesk 500/600.
- Load both from Google Fonts: `family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600`.

| Role                         | Font          | Size / weight                                 |
| ---------------------------- | ------------- | --------------------------------------------- |
| Page title (h1)              | Space Grotesk | 32px / 600 (Detail: 30px)                     |
| Stat number                  | Space Grotesk | 28px / 600, unit suffix 14px / 500 in `muted` |
| Threshold value              | Space Grotesk | 24px / 600                                    |
| Logo wordmark                | Space Grotesk | 20px / 600                                    |
| Card heading (h2)            | Inter         | 15–16px / 600                                 |
| Sender name                  | Inter         | 15px / 600                                    |
| Body                         | Inter         | 14px / 400                                    |
| Meta, captions               | Inter         | 13px / 400                                    |
| Chips, badges, table headers | Inter         | 12px / 600                                    |

### Radius, spacing, sizing

- Radius: cards `12px`, option cards `10px`, buttons and inputs `8px`, chips `6px`, checkbox `5px`, pills, avatars and badges `999px`.
- Touch targets: every button, link-button, input and select is at least **44px** tall. Filter pills are 40px and option rows 48px.
- Main content padding is `32px 40px 48px`. Content max-width is `1080px` (Rules: `860px`), centered.
- Vertical rhythm between page sections is `24px` (Rules: `20px`). Card padding is `16–20px`. List gaps are `10px` and grid gaps `12px`.
- Focus ring on every interactive element: `outline: 2px solid #1D4ED8; outline-offset: 2px` on `:focus-visible`.

## Layout shell (all screens)

- The root is a `flex flex-wrap min-h-screen` row.
- **Sidebar nav:** `flex: 1 1 200px`, white, right border, `24px 16px` padding.
  - Logo: a 28px stroke mail icon in `primary` plus the "Sweep" wordmark.
  - Three nav links (Review with an amber count badge, Activity, Rules & safety). Each is 44px tall with an 8px radius.
  - The active link uses `primary-soft` background, `primary-ink` text, weight 600 and `aria-current="page"`.
  - Footer: "Connected to / you@gmail.com", pinned to the bottom with `margin-top: auto`.
- **Main:** `flex: 999 1 560px; min-width: 0`. At phone width the sidebar wraps above the content.

## Screens

### 1. Review queue (`Main.dc.html`)

- **Header:** run meta line, h1 "Needs your review", description, and the primary button "Approve all suggestions (n)", where n is the pending count in the current filter.
- **Summary grid:** 4 columns, `repeat(4, minmax(0,1fr))`. Cards are Auto-unsubscribed, Moved to Trash, Needs review (amber variant, count is live) and Protected.
- **Filter pills:** All / Unsubscribe / Delete, each showing its pending count. Selected is `ink` fill with white text; unselected is white with a `border-strong` border. Use `role="tablist"` / `role="tab"` / `aria-selected`.
- **Queue row, pending state:**
  - 40px initials avatar.
  - Sender name, then address and volume.
  - Chips: the suggestion ("Suggest: Unsubscribe" in blue, or "Suggest: Delete …" in red) and "NN% sure" in amber.
  - "**Why I'm unsure:**" reason text, plus an optional "See emails and more options →" link to the detail route.
  - Buttons on the right: **Keep** (secondary) and **Unsubscribe** or **Delete** (primary).
- **Queue row, resolved state:** a green check, "**Sender** — unsubscribed / moved to Trash (…) / kept, and I'll remember this choice", and an **Undo** text button. Undo returns the row to pending.
- **Empty state:** when nothing is pending, show the green "All caught up…" banner.

### 2. Sender review (`Detail.dc.html`)

- Back link, a 56px avatar, the sender name (h1) and a meta line.
- Two columns that wrap: the decision column (`flex: 1 1 440px`) and the recent emails column (`flex: 1 1 400px`).
- **Confidence explainer:** amber card. Heading "62% sure you can unsubscribe" with "Auto-act threshold: 95%" on the right, a reason paragraph, and a list of signals prefixed with + or −.
- **Choice fieldset:** 4 real radio options. The selected option card has a 2px `primary` border and `primary-softer` background; unselected cards have a 1px `border` border. The suggested option carries a "Suggested" badge. Cancel and Apply buttons follow.
- **Recent emails list:** each row has a classification tag (72px wide, centered) — Trip (green), Marketing (neutral), Unclear (amber) — then the subject and the date. The footer links out to Gmail.
- **Data note:** the recent-emails list comes from `GET /api/review/:id/emails` and the signals from `ReviewItem.signals`; both are populated only in demo mode for now. "Unsubscribe and delete" is shown disabled until a follow-up adds per-email classification. The suggested unsubscribe option uses generic copy ("Unsubscribe" / "Sends the sender's one-click unsubscribe. This can't be undone.") instead of the mock's "marketing only" wording, because Apply sends a whole-sender one-click unsubscribe.

### 3. Activity (`Activity.dc.html`)

- One card per run. The header row is `surface-muted` with the title on the left and a summary on the right.
- Table columns: Sender, Action, Why, Decided by, and an unlabeled column with a visually hidden "Undo" header.
- **Decided by:** green "Auto · NN%" chip or blue "You approved" chip.
- **Restore** button on delete rows only. After restoring, the action text gets a line-through in `muted` with a green "Restored" label. Unsubscribe rows show "Resubscribe at sender" instead.
- Wrap the table in `overflow-x: auto` with `min-width: 720px` on the table.
- **Dry run:** rows from a dry run show a neutral `fill-muted` / `muted` "Dry run" chip after the action text in the Action column, and never a Restore button. The design does not cover this state.

### 4. Rules & safety (`Rules.dc.html`)

- **Threshold:** a range input from 80 to 100 (default 95) with a live value display. The hint text changes with the value:
  - 98 or higher: "Very cautious…"
  - 93 to 97: "Balanced…"
  - below 93: "Aggressive…"
- **Switches:** Auto-unsubscribe (on), Auto-delete (on), Dry run (off). Each is a `<button role="switch" aria-checked>` with a 52×30 track and a 24px knob, inside a 44px hit area.
- Static green note: permanent delete is not available.
- **Always protected:** 2-column grid of `role="checkbox"` toggle buttons, all on by default: Receipts & orders, Banks/bills & statements, Travel & bookings, Security & account alerts, People you've emailed, Starred & Important.
- **Protected senders:** removable chips (the remove button has an `aria-label`) plus a text input and an Add button. The input's label is visually hidden.
- **Schedule:** a select with "Daily at 6:00 AM", "Weekly on Sunday" and "Only when I run it".

## Data shapes (TypeScript)

```ts
type SuggestedAction = "unsubscribe" | "delete";

interface ReviewItem {
  id: string;
  sender: string;
  initials: string;
  address: string;
  volume: string; // e.g. "42 emails / 6 mo"
  action: SuggestedAction;
  deleteCount?: string; // e.g. "51 older than 90 days"
  confidence: number; // 0–100
  reason: string;
  hasDetail?: boolean;
}

type Decision = "approved" | "kept";

interface ActivityRow {
  id: string;
  sender: string;
  action: string; // "Unsubscribed" | "Moved 64 to Trash"
  why: string;
  decidedBy: "auto" | "user";
  confidence?: number; // present when decidedBy === "auto"
  kind: "unsubscribe" | "delete";
  restored?: boolean;
}

interface ActivityRun {
  id: string;
  title: string;
  summary: string;
  rows: ActivityRow[];
}

interface Rules {
  threshold: number; // 80–100
  autoUnsubscribe: boolean;
  autoDelete: boolean;
  dryRun: boolean;
  protectedCategories: Record<
    "receipts" | "finance" | "travel" | "security" | "people" | "starred",
    boolean
  >;
  protectedSenders: string[];
  schedule: "daily" | "weekly" | "manual";
}
```

These types are defined as zod schemas in `packages/shared/src/schemas.ts`, and the mock data from the designs lives in `packages/shared/src/fixtures.ts`.

## Product rules the UI must reflect

1. Sweep acts on its own only when confidence is at least `rules.threshold`. Everything below goes to the Review queue.
2. "Delete" always means moving mail to Gmail Trash, which can be restored for 30 days. Never build a permanent delete.
3. Protected categories and senders are never auto-actioned and never suggested.
4. A **Keep** decision is stored as a signal for future runs.
5. In dry-run mode, every action is recorded in Activity but nothing actually happens. Label those rows accordingly (this state isn't designed yet; use a neutral "Dry run" chip).

## Accessibility (required)

- Use real `<button>`, `<a href>`, `<input>` and `<label>` elements. No clickable divs.
- Icon-only buttons need an `aria-label`. Decorative SVGs get `aria-hidden="true"`.
- The text color pairs above all meet 4.5:1 contrast. Don't lighten them.
- Every interactive element must be reachable with the keyboard and show the focus ring.

## Acceptance checklist

- [ ] Each screen matches its `.dc.html` side by side at a 1440px viewport: colors, type, spacing, radii.
- [ ] The layout wraps cleanly at 390px width (nav stacks on top, table scrolls sideways).
- [ ] Review queue: Keep, Approve and Undo update rows, the filter counts, the nav badge, the "Needs review" card and the empty state.
- [ ] Activity: Restore works on delete rows only.
- [ ] Rules: the slider hint, switches and protected toggles all update state.
- [ ] Nav links route correctly and show the active state.
