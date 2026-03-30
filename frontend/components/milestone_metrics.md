# Milestone Metrics

## Overview

`MilestoneMetrics` tracks and displays performance metrics for campaign milestone
celebrations. It provides time-to-milestone, velocity, and engagement analytics
for campaign operators, rendered in configurable layouts.

## Features

- Computes summary metrics from a `MilestoneEvent[]` history.
- Three layouts: `summary` (default), `detailed`, `compact`.
- Metrics: milestones reached, avg/fastest interval, total raised, avg raised per milestone.
- `onMetricRecorded` callback fired when milestone count increases.
- Input validation: invalid events are filtered before computation.
- History capped at 100 entries to prevent unbounded computation.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `currentPercent` | `number` | required | Funding percentage (0–100). Clamped internally. |
| `milestoneHistory` | `MilestoneEvent[]` | `[]` | History of milestone events. |
| `layout` | `"summary" \| "detailed" \| "compact"` | `"summary"` | Display layout. |
| `onMetricRecorded` | `(summary: MilestoneMetricsSummary) => void` | — | Fired when milestone count increases. |

## MilestoneEvent Shape

```ts
interface MilestoneEvent {
  threshold: 25 | 50 | 75 | 100;
  reachedAt: number;       // Unix timestamp (ms), must be > 0
  totalRaised: number;     // Token base units, must be >= 0
  contributorCount: number; // Integer, must be >= 0
}
```

## MilestoneMetricsSummary Shape

```ts
interface MilestoneMetricsSummary {
  milestonesReached: number;
  avgTimeBetweenMs: number;
  fastestIntervalMs: number;
  latestTotalRaised: number;
  avgRaisedPerMilestone: number;
}
```

## Security Assumptions

1. No `dangerouslySetInnerHTML` — all content rendered as React text nodes.
2. All numeric inputs validated and clamped before use.
3. Invalid events (bad threshold, non-positive timestamp, negative amounts) are filtered.
4. History capped at `MAX_HISTORY_ENTRIES` (100) to prevent unbounded computation.
5. No user-supplied HTML or URLs are rendered.

## Accessibility

- `role="region"` with `aria-label="Campaign milestone metrics"`.
- Metric values use `aria-label` for screen-reader context.
- Live regions (`aria-live="polite"`) announce metric updates.

## Usage

```tsx
<MilestoneMetrics
  currentPercent={fundingPercent}
  milestoneHistory={milestoneEvents}
  layout="detailed"
  onMetricRecorded={(summary) => {
    console.log(`Milestones reached: ${summary.milestonesReached}`);
  }}
/>
```

## Testing

Run: `npx jest milestone_metrics`

Target ≥ 95% coverage covering: clampPercent, isValidEvent, computeMetricsSummary,
formatDuration, all three layouts, callbacks, accessibility, and edge cases.
