# Achievement Badges

## Overview

`AchievementBadges` displays gamified achievement badges for campaign milestones.
It tracks unlocked badges, renders them in configurable layouts (grid, list,
compact), and fires callbacks when new badges are earned.

## Features

- Five default badges at 0%, 25%, 50%, 75%, and 100% funding.
- Configurable layouts: `grid` (default), `list`, `compact`.
- Optional descriptions and unlock timestamps.
- Custom badge support with sanitization.
- Callback fired once per newly unlocked badge with `unlockedAt` timestamp.
- Progress percentage display (unlocked / total).

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `currentPercent` | `number` | required | Funding percentage (0–100). Clamped internally. |
| `layout` | `"grid" \| "list" \| "compact"` | `"grid"` | Display layout. |
| `showDescriptions` | `boolean` | `true` | Show badge descriptions. |
| `showTimestamps` | `boolean` | `false` | Show unlock timestamps. |
| `onBadgeUnlocked` | `(badge: Badge) => void` | — | Fired when a badge is newly unlocked. |
| `customBadges` | `Badge[]` | — | Override default badge set. |

## Default Badges

| ID | Percent | Title | Icon |
|----|---------|-------|------|
| launch | 0% | Launched | 🚀 |
| quarter | 25% | First Quarter | 🥉 |
| halfway | 50% | Halfway Hero | 🥈 |
| threequarter | 75% | Almost Gold | 🏅 |
| complete | 100% | Gold Backer | 🥇 |

## Security Assumptions

1. No `dangerouslySetInnerHTML` — all content rendered as React text nodes.
2. Badge icons are from a hardcoded set; no user-supplied URLs.
3. Custom badge titles truncated to 100 chars, descriptions to 500 chars.
4. All numeric values clamped to safe ranges.
5. `onBadgeUnlocked` fires at most once per badge ID per component lifetime.

## Accessibility

- `role="region"` with `aria-label="Campaign achievement badges"`.
- Each badge has `aria-label` describing its unlock status.
- Decorative icons carry `aria-hidden="true"`.
- List layout count has `aria-live="polite"`.

## Usage

```tsx
<AchievementBadges
  currentPercent={fundingPercent}
  layout="grid"
  showDescriptions
  onBadgeUnlocked={(badge) => {
    console.log(`Badge unlocked: ${badge.title} at ${badge.unlockedAt}`);
  }}
/>
```

## Testing

Run: `npx jest achievement_badges`

Target ≥ 95% coverage covering: badge detection, layouts, display options,
progress calculation, callbacks, custom badges, accessibility, and edge cases.
