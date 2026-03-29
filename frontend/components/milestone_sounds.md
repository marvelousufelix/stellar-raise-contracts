# Milestone Sounds

## Overview

`MilestoneSounds` plays audio feedback when campaign funding milestones are
reached (25%, 50%, 75%, 100%). It manages sound playback lifecycle, milestone
deduplication, and user mute preferences, while providing a dismissible visual
indicator so the feature is not audio-only.

## Features

- Synthetic tone generation via the Web Audio API (no external audio files).
- Per-milestone deduplication — each threshold fires at most once per session.
- Mute toggle with `aria-pressed` state for accessibility.
- Dismissible visual indicator with `role="status"` and `aria-live="polite"`.
- Auto-hide timer with configurable delay (or disabled with `indicatorHideMs=0`).
- Graceful fallback when `AudioContext` is unavailable (SSR, older browsers).

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `currentPercent` | `number` | required | Funding percentage (0–100). Clamped internally. |
| `campaignName` | `string` | — | Optional name shown in the visual indicator. |
| `soundEnabled` | `boolean` | `true` | Initial mute state. |
| `volume` | `number` | `0.5` | Volume level [0, 1]. |
| `indicatorHideMs` | `number` | `3000` | Auto-hide delay in ms. `0` disables. |
| `onMilestoneSound` | `(threshold, soundType) => void` | — | Fired when a milestone sound triggers. |

## Sound Mapping

| Milestone | Sound Type | Frequency |
|-----------|-----------|-----------|
| 25% | chime | 880 Hz |
| 50% | bell | 660 Hz |
| 75% | fanfare | 1046 Hz |
| 100% | celebration | 1318 Hz |

## Security Assumptions

1. Audio sources are from a hardcoded allowlist — no user-supplied URLs.
2. Campaign name is sanitized (control chars stripped, truncated to 60 chars).
3. Progress values are clamped to [0, 100] to prevent logic abuse.
4. `AudioContext` is created lazily; errors are caught silently.
5. All timers are cleared on unmount to prevent memory leaks.

## Usage

```tsx
<MilestoneSounds
  currentPercent={fundingPercent}
  campaignName="My Campaign"
  volume={0.4}
  onMilestoneSound={(threshold, soundType) => {
    console.log(`Milestone ${threshold}% — played ${soundType}`);
  }}
/>
```

## Testing

Run: `npx jest milestone_sounds`

Target ≥ 95% coverage covering: clampProgress, sanitizeString,
resolveNextSoundMilestone, getMilestoneSoundConfig, rendering, mute toggle,
dismiss, callbacks, auto-hide, accessibility, and edge cases.
