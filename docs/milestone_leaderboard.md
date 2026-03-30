# milestone_leaderboard

## Overview

`MilestoneLeaderboard` is a React component that renders a ranked list of
campaign contributors sorted by contribution amount. It supports address
privacy (truncation by default), medal styling for the top 3 contributors,
per-entry mini progress bars, and a click callback for drill-down UIs.

## Props

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `entries` | `LeaderboardEntry[]` | ✅ | — | Contributor entries to display |
| `goal` | `number` | ✅ | — | Campaign funding goal (used for progress bars) |
| `currentPercent` | `number` | ✅ | — | Overall funding percentage |
| `maxVisible` | `number` | ❌ | `10` | Maximum entries to show |
| `showAddresses` | `boolean` | ❌ | `false` | Show full addresses; truncates by default |
| `onEntryClick` | `(entry: LeaderboardEntry) => void` | ❌ | — | Called when a row is clicked |

### LeaderboardEntry

```ts
interface LeaderboardEntry {
  rank: number;
  address: string;
  contribution: number;
  displayName?: string;
}
```

## Security Assumptions

- No `dangerouslySetInnerHTML` — all content is rendered as React text nodes.
- Addresses are truncated to `XXXX...XXXX` by default to prevent accidental
  PII exposure in screenshots or recordings.
- `displayName` is rendered as text, never as HTML.
- The original `entries` array is never mutated; sorting is done on a copy.
- `contribution / goal` division is guarded against zero-goal via `safeGoal`.

## Accessibility

- Root element: `role="region"` with `aria-label="Milestone Leaderboard"`.
- Entry list: `role="list"` / `role="listitem"`.
- Per-entry progress bars: `role="progressbar"` with `aria-valuenow`,
  `aria-valuemin`, and `aria-valuemax`.

## Usage Example

```tsx
import MilestoneLeaderboard, { type LeaderboardEntry } from "./milestone_leaderboard";

const entries: LeaderboardEntry[] = [
  { rank: 1, address: "GABC...5678", contribution: 500, displayName: "Alice" },
  { rank: 2, address: "GDEF...9012", contribution: 300 },
];

<MilestoneLeaderboard
  entries={entries}
  goal={1000}
  currentPercent={80}
  maxVisible={5}
  showAddresses={false}
  onEntryClick={(entry) => console.log(entry)}
/>
```

## Test Coverage

Tests are in `milestone_leaderboard.test.tsx` and cover:

- Rendering — region, entries, displayName
- Address privacy — truncation and full display modes
- Sorting — descending by contribution, no mutation of original array
- maxVisible — entry count limiting
- Medal styling — gold/silver/bronze CSS classes for top 3
- onEntryClick — callback with correct entry, graceful no-op when omitted
- Empty state — no crash on empty entries array
- Accessibility — region aria-label, list role, progressbar attributes

Target: **≥ 95% statement coverage**.
