# milestone_analytics

> **Component:** `frontend/components/milestone_analytics.tsx`
> **Tests:** `frontend/components/milestone_analytics.test.tsx`
> **Issue:** create-campaign-milestone-celebration-analytics-for-frontend-ui

---

## Overview

`MilestoneAnalytics` is a React component that combines a milestone celebration
overlay with a live business-intelligence dashboard for the Stellar Raise
crowdfunding dApp. When a campaign crosses a funding threshold (25 %, 50 %,
75 %, 100 %), it fires a dismissible overlay and emits a structured
`MilestoneEvent` for downstream analytics. Below the overlay, an
`AnalyticsDashboard` renders up to six KPI cards derived from live campaign
metrics: funding progress, daily velocity (with trend), contributor engagement,
conversion rate, goal projection, and deadline urgency.

---

## Security Assumptions

| # | Assumption |
|---|-----------|
| 1 | No `dangerouslySetInnerHTML` — all content rendered as React text nodes. |
| 2 | `campaignName` is passed through `sanitizeAnalyticsString` (control chars stripped, whitespace collapsed, length capped to `MAX_ANALYTICS_NAME_LENGTH`). |
| 3 | `currentPercent` is clamped to `[0, 100]` by `clampAnalyticsPercent` before any comparison. |
| 4 | Severity colors in KPI cards are sourced from a hardcoded map — no user-controlled CSS values. |
| 5 | Auto-dismiss timer is cleared on unmount to prevent memory leaks. |
| 6 | `onMilestone` / `onDismiss` callbacks are guarded against post-unmount calls via `mountedRef`. |
| 7 | All numeric inputs are validated with `Number.isFinite` before use in calculations. |

---

## Exported API

### Constants

| Name | Value | Description |
|------|-------|-------------|
| `ANALYTICS_MILESTONES` | `[25, 50, 75, 100]` | Supported thresholds |
| `DEFAULT_ANALYTICS_DISMISS_MS` | `5000` | Default auto-dismiss delay |
| `MAX_ANALYTICS_NAME_LENGTH` | `80` | Max chars for campaign name |
| `MAX_KPI_CARDS` | `6` | Max KPI cards in dashboard |
| `STRONG_VELOCITY_THRESHOLD` | `1000` | Tokens/day for "strong" velocity |
| `HIGH_ENGAGEMENT_THRESHOLD` | `10` | Contributors for "high engagement" |
| `HEALTHY_CONVERSION_RATE` | `5` | Percent for "healthy" conversion |

### Pure helpers

| Function | Description |
|----------|-------------|
| `clampAnalyticsPercent(value)` | Clamps to `[0, 100]`; returns 0 for NaN/non-finite |
| `sanitizeAnalyticsString(input, maxLength)` | Strips control chars, collapses whitespace, truncates |
| `resolveAnalyticsMilestone(percent, celebrated)` | Returns lowest uncelebrated threshold crossed, or null |
| `getMilestoneAnalyticsContent(threshold)` | Returns `{ icon, heading }` for a threshold |
| `computeFundingPercent(totalRaised, goal)` | Funding progress as clamped percentage |
| `computeConversionRate(contributors, pageViews)` | Contributor conversion rate as percentage |
| `computeVelocityTrend(current, previous)` | Returns `"up"` / `"down"` / `"flat"` |
| `computeDaysToGoal(totalRaised, goal, velocity)` | Estimated days to goal (ceiling), or null |
| `formatAnalyticsValue(value)` | Abbreviates large numbers (K/M), returns "—" for non-finite |
| `deriveKpis(metrics)` | Derives up to `MAX_KPI_CARDS` sorted KPI metrics |

### Components

| Component | Description |
|-----------|-------------|
| `AnalyticsCard` | Single KPI card with label, value, optional subtext and trend |
| `AnalyticsDashboard` | Responsive KPI grid with loading/empty states |
| `MilestoneAnalytics` | Main component: celebration overlay + analytics dashboard |

### Types

| Type | Description |
|------|-------------|
| `AnalyticsMilestone` | `25 \| 50 \| 75 \| 100` |
| `KpiSeverity` | `"info" \| "success" \| "warning" \| "critical"` |
| `KpiCategory` | `"funding" \| "velocity" \| "engagement" \| "conversion" \| "projection" \| "celebration"` |
| `KpiMetric` | Single KPI data object |
| `AnalyticsMetrics` | Campaign metrics input shape |
| `MilestoneEvent` | Structured event emitted on milestone reach |
| `MilestoneAnalyticsProps` | Props for `MilestoneAnalytics` |

---

## Component Props

### MilestoneAnalytics

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `currentPercent` | `number` | required | Current funding % (clamped internally) |
| `metrics` | `AnalyticsMetrics` | required | Campaign metrics for KPI derivation |
| `campaignName` | `string` | — | Optional name shown in overlay and dashboard |
| `autoDismissMs` | `number` | `5000` | Auto-dismiss delay; `0` disables |
| `onMilestone` | `(event: MilestoneEvent) => void` | — | Called when a milestone is reached |
| `onDismiss` | `(threshold: AnalyticsMilestone) => void` | — | Called when overlay is dismissed |
| `showDashboard` | `boolean` | `true` | Whether to render the KPI dashboard |
| `className` | `string` | — | Additional CSS class for root element |

### AnalyticsMetrics shape

| Field | Type | Description |
|-------|------|-------------|
| `totalRaised` | `number` | Tokens raised so far |
| `goal` | `number` | Campaign funding goal |
| `contributorCount` | `number` | Unique contributors |
| `pageViews` | `number` | Total campaign page views |
| `daysRemaining` | `number` | Days until deadline |
| `dailyVelocity` | `number` | Avg tokens/day (last 7 days) |
| `previousVelocity` | `number` | Avg tokens/day (prior 7-day window) |
| `largestContrib` | `number` | Largest single contribution |

---

## Usage

```tsx
import MilestoneAnalytics from "@/components/milestone_analytics";

<MilestoneAnalytics
  currentPercent={fundingPercent}
  metrics={{
    totalRaised: 5000,
    goal: 10000,
    contributorCount: 42,
    pageViews: 840,
    daysRemaining: 7,
    dailyVelocity: 1200,
    previousVelocity: 900,
    largestContrib: 500,
  }}
  campaignName="Solar Farm Project"
  onMilestone={(event) => analytics.track("milestone_reached", event)}
  onDismiss={(threshold) => analytics.track("milestone_dismissed", { threshold })}
  autoDismissMs={5000}
/>
```

---

## KPI Cards

The dashboard derives up to six KPI cards, sorted by severity (critical first):

| KPI | Severity logic |
|-----|---------------|
| Funding Progress | success ≥ 100%, info ≥ 50%, warning < 50% |
| Daily Velocity | success ≥ 1000/day, info otherwise |
| Contributors | success ≥ 10, info otherwise |
| Conversion Rate | success ≥ 5%, warning < 5% |
| Goal Projection | success = on track, warning = behind |
| Deadline Alert | critical when ≤ 3 days remain and not fully funded |

---

## Accessibility

- `role="region"` with `aria-label` on the analytics dashboard for landmark navigation.
- `role="status"` + `aria-live="polite"` on the celebration overlay for screen-reader announcements.
- `role="progressbar"` with `aria-valuenow/min/max` on the funding progress bar.
- Dismiss button has `aria-label="Dismiss milestone celebration"`.
- Decorative icons carry `aria-hidden="true"`.
- All interactive elements meet 44×44 px minimum touch target.

---

## Running the Tests

```bash
# Run milestone analytics tests only
npx jest milestone_analytics --coverage

# Run all frontend tests
npm test
```

Expected: all tests pass, ≥ 95% coverage.
