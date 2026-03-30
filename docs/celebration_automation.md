# celebration_automation

Automated milestone celebration overlay for the Stellar Raise crowdfunding dApp.

## Overview

`CelebrationAutomation` detects when a campaign crosses a funding milestone (25%, 50%, 75%, 100%), fires a celebration overlay exactly once per threshold, and auto-dismisses after a configurable delay.

## Security Assumptions

| # | Assumption |
|---|-----------|
| 1 | No `dangerouslySetInnerHTML` — all content rendered as React text nodes. |
| 2 | `campaignName` and labels are sanitized (control chars stripped, whitespace collapsed, length capped). |
| 3 | `currentPercent` is clamped to [0, 100] before any comparison. |
| 4 | Auto-dismiss timer is cleared on unmount to prevent memory leaks. |
| 5 | `onCelebrate` / `onDismiss` callbacks are guarded against post-unmount calls. |

## Exported API

### Constants

| Name | Value | Description |
|------|-------|-------------|
| `AUTOMATION_MILESTONES` | `[25, 50, 75, 100]` | Supported thresholds |
| `DEFAULT_AUTO_DISMISS_MS` | `5000` | Default auto-dismiss delay |
| `MAX_CAMPAIGN_NAME_LENGTH` | `60` | Max chars for campaign name |
| `MAX_LABEL_LENGTH` | `80` | Max chars for labels |

### Pure helpers

| Function | Description |
|----------|-------------|
| `clampProgress(value)` | Clamps a number to [0, 100]; returns 0 for NaN/non-number |
| `sanitizeLabel(input, maxLength)` | Strips control chars, collapses whitespace, truncates |
| `resolveNextMilestone(percent, celebrated)` | Returns the lowest uncelebrated threshold crossed, or null |
| `getMilestoneContent(threshold)` | Returns `{ icon, heading }` for a given threshold |

### Component props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `currentPercent` | `number` | required | Current funding % (clamped internally) |
| `campaignName` | `string` | — | Optional name shown in overlay |
| `onCelebrate` | `(threshold) => void` | — | Called when a milestone triggers |
| `onDismiss` | `(threshold) => void` | — | Called when overlay is dismissed |
| `autoDismissMs` | `number` | `5000` | Auto-dismiss delay; `0` disables |

## Usage

```tsx
<CelebrationAutomation
  currentPercent={fundingPercent}
  campaignName="Solar Farm Project"
  onCelebrate={(t) => console.log(`${t}% reached`)}
  onDismiss={(t) => analytics.track("celebration_dismissed", { threshold: t })}
/>
```

## Accessibility

- `role="status"` + `aria-live="polite"` for screen-reader announcements.
- Dismiss button has `aria-label="Dismiss celebration"`.
- Decorative icons carry `aria-hidden="true"`.

## Test Coverage

`celebration_automation.test.tsx` covers:
- All pure helpers (happy path + edge cases).
- Component renders nothing below first threshold.
- Correct heading/icon per milestone.
- Campaign name display and truncation.
- Manual dismiss hides overlay and calls `onDismiss`.
- Auto-dismiss fires after `autoDismissMs`.
- `autoDismissMs=0` disables auto-dismiss.
- `onCelebrate` callback fires on milestone cross.
- Deduplication: same milestone not re-triggered.
- Accessibility attributes.
- All exported constants.
