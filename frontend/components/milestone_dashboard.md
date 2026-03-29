# milestone_dashboard

> Component: `frontend/components/milestone_dashboard.tsx`
> Tests: `frontend/components/milestone_dashboard.test.tsx`
> Branch: `feature/create-campaign-milestone-celebration-dashboard-for-frontend-ui`

---

## Overview

`MilestoneDashboard` is a React component that combines a dismissible milestone
celebration overlay with a full campaign management dashboard for the Stellar
Raise crowdfunding dApp. When a campaign crosses a funding threshold (25%, 50%,
75%, 100%), it fires a celebration overlay and emits a structured `MilestoneEvent`.
Below the overlay, the dashboard renders a funding progress bar, four KPI cards,
and a top-contributor leaderboard.

---

## Security Assumptions

| # | Assumption |
|---|-----------|
| 1 | No `dangerouslySetInnerHTML` — all content rendered as React text nodes. |
| 2 | All user-supplied strings pass through `sanitizeDashboardString` (control chars stripped, whitespace collapsed, length capped). |
| 3 | `currentPercent` is clamped to `[0, 100]` by `clampDashboardPercent` before any comparison. |
| 4 | Severity border colours in KPI cards are sourced from a hardcoded map — no user-controlled CSS values. |
| 5 | Auto-dismiss timer is cleared on unmount to prevent memory leaks. |
| 6 | `onMilestone` / `onDismiss` callbacks are guarded against post-unmount calls via `mountedRef`. |
| 7 | All numeric inputs are validated with `Number.isFinite` before use in calculations. |
| 8 | Leaderboard is capped at `MAX_LEADERBOARD_ENTRIES` (10) to prevent unbounded rendering. |

---

## Exported API

### Constants

| Name | Value | Description |
|------|-------|-------------|
| `DASHBOARD_MILESTONES` | `[25, 50, 75, 100]` | Supported thresholds |
| `DEFAULT_DISMISS_MS` | `5000` | Default auto-dismiss delay |
| `MAX_NAME_LENGTH` | `80` | Max chars for campaign name |
| `MAX_CONTRIBUTOR_NAME_LENGTH` | `50` | Max chars for contributor name |
| `MAX_LEADERBOARD_ENTRIES` | `10` | Max leaderboard rows |
| `STRONG_VELOCITY_THRESHOLD` | `1000` | Tokens/day for "success" velocity |
| `HIGH_ENGAGEMENT_THRESHOLD` | `10` | Contributors for "success" engagement |
| `URGENT_DAYS_THRESHOLD` | `3` | Days remaining for "critical" deadline |

### Pure helpers

| Function | Description |
|----------|-------------|
| `clampDashboardPercent(value)` | Clamps to `[0, 100]`; returns 0 for non-finite |
| `sanitizeDashboardString(input, maxLength)` | Strips control chars, collapses whitespace, truncates |
| `resolveNextDashboardMilestone(percent, celebrated)` | Returns lowest uncelebrated threshold crossed, or null |
| `getMilestoneDashboardContent(threshold)` | Returns `{ icon, heading }` for a threshold |
| `computeDashboardFundingPercent(totalRaised, goal)` | Funding progress as clamped percentage |
| `computeVelocityTrend(current, previous)` | Returns `"up"` / `"down"` / `"flat"` |
| `formatDashboardValue(value)` | Abbreviates large numbers (k/M), returns "—" for non-finite |
| `deriveKpiCards(metrics, currentPercent)` | Derives 4 KPI cards sorted by severity |

### Components

| Component | Description |
|-----------|-------------|
| `KpiCardView` | Single KPI card with label, value, optional subtext and trend arrow |
| `ContributorLeaderboard` | Ordered leaderboard with empty state |
| `MilestoneDashboard` | Main component: celebration overlay + management dashboard |

### Types

| Type | Description |
|------|-------------|
| `DashboardMilestone` | `25 \| 50 \| 75 \| 100` |
| `KpiSeverity` | `"info" \| "success" \| "warning" \| "critical"` |
| `ContributorEntry` | `{ id, name, amount }` |
| `DashboardMetrics` | Campaign metrics input shape |
| `MilestoneEvent` | Structured event emitted on milestone reach |
| `KpiCard` | Single KPI data object |
| `MilestoneDashboardProps` | Props for `MilestoneDashboard` |

---

## Component Props

### MilestoneDashboard

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `currentPercent` | `number` | required | Current funding % (clamped internally) |
| `metrics` | `DashboardMetrics` | required | Campaign metrics for KPI derivation |
| `campaignName` | `string` | — | Optional name shown in overlay and dashboard |
| `autoDismissMs` | `number` | `5000` | Auto-dismiss delay; `0` disables |
| `onMilestone` | `(event: MilestoneEvent) => void` | — | Called when a milestone is reached |
| `onDismiss` | `(threshold: DashboardMilestone) => void` | — | Called when overlay is dismissed |
| `showDashboard` | `boolean` | `true` | Whether to render the management dashboard |
| `className` | `string` | — | Additional CSS class for root element |

### DashboardMetrics shape

| Field | Type | Description |
|-------|------|-------------|
| `totalRaised` | `number` | Tokens raised so far |
| `goal` | `number` | Campaign funding goal |
| `contributorCount` | `number` | Unique contributors |
| `pageViews` | `number` | Total campaign page views |
| `daysRemaining` | `number` | Days until deadline |
| `dailyVelocity` | `number` | Avg tokens/day (last 7 days) |
| `previousVelocity` | `number` | Avg tokens/day (prior 7-day window) |
| `topContributors` | `ContributorEntry[]` | Top contributors for leaderboard |

---

## Usage

```tsx
import MilestoneDashboard from "@/components/milestone_dashboard";

<MilestoneDashboard
  currentPercent={fundingPercent}
  metrics={{
    totalRaised: 5000,
    goal: 10000,
    contributorCount: 42,
    pageViews: 840,
    daysRemaining: 7,
    dailyVelocity: 1200,
    previousVelocity: 900,
    topContributors: [
      { id: "1", name: "Alice", amount: 500 },
      { id: "2", name: "Bob",   amount: 300 },
    ],
  }}
  campaignName="Solar Farm Project"
  onMilestone={(event) => analytics.track("milestone_reached", event)}
  onDismiss={(threshold) => analytics.track("milestone_dismissed", { threshold })}
  autoDismissMs={5000}
/>
```

---

## KPI Cards

The dashboard derives 4 KPI cards, sorted by severity (critical first):

| KPI | Severity logic |
|-----|---------------|
| Funding Progress | success ≥ 100%, info ≥ 50%, warning < 50% |
| Daily Velocity | success ≥ 1000/day, info otherwise; trend arrow shown |
| Contributors | success ≥ 10, info otherwise |
| Days Remaining | critical when ≤ 3 days and not fully funded, info otherwise |

---

## Accessibility

- `role="region"` with `aria-label="Campaign milestone dashboard"` for landmark navigation.
- `role="status"` + `aria-live="polite"` on the celebration overlay for screen-reader announcements.
- `role="progressbar"` with `aria-valuenow/min/max` on the funding progress bar.
- Dismiss button has `aria-label="Dismiss milestone celebration"`.
- Decorative icons carry `aria-hidden="true"`.

---

## Running the Tests

```bash
# Run milestone dashboard tests only
npx jest milestone_dashboard --coverage

# Run all frontend tests
npm test
```

Expected: all tests pass, ≥ 95% coverage.

---

## Test Coverage Map

| Section | Tests | Coverage area |
|---------|-------|---------------|
| `clampDashboardPercent` | 9 | NaN, Infinity, bounds, pass-through |
| `sanitizeDashboardString` | 11 | null/undefined/number, control chars, whitespace, truncation |
| `resolveNextDashboardMilestone` | 7 | All thresholds, deduplication, boundary |
| `getMilestoneDashboardContent` | 6 | All 4 thresholds, icon/heading |
| `computeDashboardFundingPercent` | 8 | Zero/negative/NaN goal, half, full, over |
| `computeVelocityTrend` | 6 | up/down/flat, NaN inputs |
| `formatDashboardValue` | 8 | NaN, Infinity, 0, k, M, negative |
| `deriveKpiCards` | 11 | All severity levels, trend, sort order |
| Overlay rendering | 12 | All thresholds, name, truncation, a11y |
| Overlay dismiss | 3 | Manual dismiss, callback, aria-label |
| Auto-dismiss | 3 | Timer fires, callback, disabled |
| `onMilestone` callback | 3 | Threshold, name, timestamp |
| Deduplication | 1 | Same milestone not re-triggered |
| Dashboard panel | 11 | Show/hide, title, progress bar, KPI grid, leaderboard, a11y |
| KPI card values | 5 | Percent, subtext, trend arrows |
| `ContributorLeaderboard` | 6 | Empty state, names, amounts, cap, sanitize, anonymous |
| `KpiCardView` | 6 | Label, value, subtext, trend icons |
| Constants | 8 | All exported constant values |
| Security assumptions | 6 | Clamp range, sanitize, no overlay leak, negative format |
