# MilestoneCountdown

A React component that renders a live countdown to a campaign deadline and fires
dismissible milestone celebration banners when funding thresholds are crossed.

## Overview

`MilestoneCountdown` combines two concerns:

1. **Countdown timer** — ticks every second and displays days / hours / minutes /
   seconds remaining until `deadlineUnix`. When the deadline passes the timer is
   replaced by a "Campaign Ended" notice.

2. **Milestone celebrations** — given a list of `Milestone` objects (each with a
   basis-point threshold, title, and message), the component resolves the highest
   triggered milestone and shows a dismissible banner. The banner re-appears
   automatically when `progressBps` advances past a new threshold.

## File locations

| File | Purpose |
|---|---|
| `frontend/components/milestone_countdown.tsx` | Component + exported pure helpers |
| `frontend/components/milestone_countdown.test.tsx` | Jest / RTL test suite (≥ 95 % coverage) |
| `docs/milestone_countdown.md` | This document |

## Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `deadlineUnix` | `number` | ✅ | Campaign deadline as a Unix timestamp (seconds). Must be a positive integer. |
| `progressBps` | `number` | ✅ | Current campaign progress in basis points (0 – 10 000). |
| `milestones` | `Milestone[]` | ❌ | Ordered list of milestones. Defaults to `[]`. |
| `nowFn` | `() => number` | ❌ | Clock override returning milliseconds. Defaults to `Date.now`. Useful for testing. |
| `onMilestoneDismiss` | `() => void` | ❌ | Called when the user dismisses a celebration banner. |

### Milestone shape

```ts
interface Milestone {
  thresholdBps: number; // 1 – 10 000 (inclusive)
  title: string;        // max 60 chars after sanitisation
  message: string;      // max 160 chars after sanitisation
}
```

## Usage

```tsx
import MilestoneCountdown from "@/components/milestone_countdown";

const milestones = [
  { thresholdBps: 2_500, title: "Quarter Way!", message: "25% funded — keep going!" },
  { thresholdBps: 5_000, title: "Halfway There!", message: "50% funded — amazing!" },
  { thresholdBps: 10_000, title: "Goal Reached!", message: "Campaign fully funded!" },
];

<MilestoneCountdown
  deadlineUnix={1_780_000_000}
  progressBps={currentProgressBps}
  milestones={milestones}
  onMilestoneDismiss={() => console.log("dismissed")}
/>
```

## Exported pure helpers

All helpers are exported for direct unit testing.

| Helper | Signature | Description |
|---|---|---|
| `sanitizeText` | `(value, maxLen) => string` | Strips control chars, collapses whitespace, truncates. |
| `isValidDeadline` | `(deadlineUnix) => boolean` | Guards against NaN, Infinity, negatives, non-integers. |
| `computeTimeLeft` | `(deadlineUnix, nowMs) => TimeLeft \| null` | Decomposes remaining seconds into d/h/m/s. Returns `null` when expired. |
| `isValidMilestone` | `(m) => m is Milestone` | Type guard; rejects out-of-range thresholds and empty strings. |
| `resolveTriggeredMilestone` | `(progressBps, milestones) => Milestone \| null` | Returns the highest valid milestone whose threshold ≤ progressBps. |
| `padTwo` | `(n) => string` | Zero-pads a number to at least two digits. |

## Security assumptions

- **No `dangerouslySetInnerHTML`** — all user-supplied strings are rendered as
  React text nodes.
- **Input sanitisation** — `sanitizeText` strips Unicode control characters
  (U+0000–U+001F, U+007F), collapses whitespace, and hard-truncates to the
  configured maximum length before any string reaches the DOM.
- **Deadline validation** — `isValidDeadline` rejects NaN, Infinity, floats,
  zero, and negative values. The component renders `null` for invalid deadlines,
  preventing a broken UI state.
- **Milestone validation** — `isValidMilestone` rejects milestones with
  out-of-range thresholds or empty labels; invalid entries are silently skipped
  by `resolveTriggeredMilestone`.
- **Timer cleanup** — the `setInterval` is cleared in the `useEffect` cleanup
  function, preventing memory leaks and stale-closure updates after unmount.
- **Callback isolation** — `onMilestoneDismiss` carries no data back to the
  caller, preventing information leakage through the callback interface.

## Accessibility

- The root element has `role="region"` and `aria-label="Campaign countdown"`.
- The timer element has `role="timer"` with a human-readable `aria-label`
  (e.g. "1 days 0 hours 0 minutes 0 seconds remaining").
- The "Campaign Ended" notice has `role="status"` and `aria-live="polite"`.
- The celebration banner has `role="alert"` and `aria-live="assertive"` so
  screen readers announce it immediately.
- The dismiss button has `aria-label="Dismiss celebration"`.

## Running tests

```bash
# From the workspace root
npm test -- --testPathPattern=milestone_countdown --run
```

Expected output: all tests pass with ≥ 95 % statement coverage.
