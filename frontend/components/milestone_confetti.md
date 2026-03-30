# milestone_confetti

Canvas-based confetti celebration overlay for the Stellar Raise crowdfunding frontend. Fires animated confetti particles and displays a dismissible banner whenever a campaign crosses a funding milestone (25 %, 50 %, 75 %, 100 %).

## Files

| File | Purpose |
|---|---|
| `milestone_confetti.tsx` | React component + pure helpers |
| `milestone_confetti.test.tsx` | Jest / Testing Library test suite |
| `milestone_confetti.md` | This document |

## Usage

```tsx
import { MilestoneConfetti } from "./milestone_confetti";

<MilestoneConfetti
  progress={totalRaised / goal * 100}
  campaignName="Solar Farm"
  onMilestone={(m) => console.log(`Reached ${m}%`)}
  onDismiss={() => console.log("dismissed")}
/>
```

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `progress` | `number` | — | Funding progress as a percentage. Clamped to `[0, 100]`. |
| `campaignName` | `string` | `""` | Campaign name shown in the banner. Sanitized before render. |
| `dismissMs` | `number` | `5000` | Auto-dismiss delay in ms. Pass `0` to disable. |
| `onMilestone` | `(m: ConfettiMilestone) => void` | — | Called once per milestone when first reached. |
| `onDismiss` | `() => void` | — | Called when the overlay is dismissed. |

## Milestone Thresholds

`25`, `50`, `75`, `100` (percent). Each fires at most once per component lifetime.

## Security

- **No `dangerouslySetInnerHTML`** — all content rendered as React text nodes.
- **`campaignName` sanitized** via `sanitizeConfettiName`: strips control characters, collapses whitespace, truncates to 60 characters.
- **Progress clamped** to `[0, 100]` via `clampConfettiProgress` — prevents layout abuse from out-of-range values.
- **Hardcoded colour palettes** — no user-controlled CSS injected into the canvas.
- **All timers and animation frames cancelled on unmount** — no post-unmount state updates or memory leaks.

## Accessibility

- `role="dialog"` on the overlay with a descriptive `aria-label`.
- `role="status"` + `aria-live="polite"` on the banner for screen-reader announcements.
- Dismiss button has `aria-label="Dismiss celebration"`.
- Canvas is `aria-hidden="true"` — purely decorative.

## Running Tests

```bash
# From the repo root
npm test -- --testPathPattern=milestone_confetti
```

Expected output: all tests pass with no warnings.
