# Celebration Insights

## Overview

The `celebration_insights` module surfaces campaign milestone celebration overlays alongside strategic planning insights for the Stellar Raise crowdfunding dApp. It combines real-time funding metrics (velocity, contributor engagement, deadline urgency) with milestone celebration UX to help campaign creators make informed decisions.

---

## Files

| File | Purpose |
|---|---|
| `frontend/components/celebration_insights.tsx` | Component implementation |
| `frontend/components/celebration_insights.test.tsx` | Comprehensive test suite |
| `frontend/components/celebration_insights.md` | This document |

---

## Core Types

### `CampaignMetrics`

Input data used to derive insights.

```ts
interface CampaignMetrics {
  totalRaised: number;
  goal: number;
  contributorCount: number;
  daysRemaining: number;
  dailyVelocity: number;   // tokens/day (7-day average)
  largestContrib: number;
}
```

### `Insight`

A single derived insight shown in the panel.

```ts
interface Insight {
  id: string;
  category: InsightCategory;  // "velocity" | "engagement" | "projection" | "strategy" | "celebration" | "warning"
  severity: InsightSeverity;  // "info" | "success" | "warning" | "critical"
  title: string;
  body: string;
  value?: string;             // abbreviated display value (e.g. "1.5K/day")
}
```

---

## Components

### `InsightCard`

Renders a single insight with severity icon, title, body, and optional value badge.

```tsx
<InsightCard insight={insight} />
```

### `InsightPanel`

Renders a responsive grid of `InsightCard` components with loading and empty states.

```tsx
<InsightPanel
  insights={insights}
  isLoading={false}
  campaignName="My Campaign"
/>
```

### `CelebrationInsights` (default export)

Main component combining milestone celebration overlay with the insights panel.

```tsx
<CelebrationInsights
  milestones={milestones}
  currentPercent={fundingPercent}
  metrics={campaignMetrics}
  campaignName="My Campaign"
  autoDismissMs={5000}
  onDismiss={() => markCelebrated(milestone.id)}
  onMilestoneReach={(m) => console.log("reached", m.id)}
  showInsights={true}
/>
```

---

## Pure Helper Functions

| Function | Description |
|---|---|
| `clampPercent(value)` | Clamps to [0, 100]; returns 0 for NaN/Infinity |
| `safeString(value, fallback, maxLen?)` | Trims, truncates, and validates strings |
| `computeFundingPercent(raised, goal)` | Returns funding % clamped to [0, 100] |
| `computeDaysToGoal(raised, goal, velocity)` | Estimates days to goal; `null` when velocity=0 or goal met |
| `getActiveMilestone(milestones)` | Returns first `"reached"` milestone or `null` |
| `formatInsightValue(value)` | Abbreviates large numbers (K/M suffix) |
| `deriveInsights(metrics, milestones)` | Derives up to `MAX_INSIGHTS` sorted insights |

---

## Insight Derivation Logic

`deriveInsights` produces up to 6 insights sorted by severity (critical → warning → success → info):

| Insight ID | Trigger | Severity |
|---|---|---|
| `velocity` | `dailyVelocity > 0` | success (≥ threshold) / info |
| `projection` | velocity > 0 and goal not met | success (on track) / warning |
| `engagement` | `contributorCount > 0` | success (≥ threshold) / info |
| `urgency` | `daysRemaining ≤ 3` and not funded | critical |
| `whale` | largest contrib ≥ 20% of goal | info |
| `milestone-{id}` | active milestone with status `"reached"` | success |

---

## Security Assumptions

- No `dangerouslySetInnerHTML` is used. All user-supplied strings are rendered as React text nodes.
- Numeric inputs are validated with `Number.isFinite()` before use in calculations.
- Percentage values are clamped to [0, 100] before CSS `width` injection.
- `safeString` truncates all user strings before rendering.
- `deriveInsights` validates the `metrics` object before processing.

---

## Test Coverage

Run the test suite with:

```bash
npm test -- --testPathPattern=celebration_insights --coverage
```

Expected: all tests pass, ≥ 95% statement/branch/function/line coverage.

Test categories:
- `clampPercent`: negative, above 100, in-range, NaN, Infinity
- `safeString`: trim, empty, whitespace, non-string, truncation, XSS
- `computeFundingPercent`: half, full, over, zero goal, negative goal, non-finite
- `computeDaysToGoal`: correct days, goal met, zero velocity, negative velocity, non-finite, rounding
- `getActiveMilestone`: none reached, first reached, empty, non-array
- `formatInsightValue`: small, thousands, millions, non-finite, rounding
- `deriveInsights`: valid, invalid, cap, velocity, projection, urgency, whale, milestone, sort order
- `InsightCard`: title/body, value, no value, role, testid, all severities
- `InsightPanel`: loading, empty, populated, campaign name, non-array
- `CelebrationInsights`: render, no celebration, celebration shown, dismiss, onDismiss, auto-dismiss, onMilestoneReach, campaign name, showInsights=false, progress bar, clamping, null milestones, truncation, XSS, id/className
