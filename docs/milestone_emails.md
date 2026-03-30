# milestone_emails

## Overview

`MilestoneEmail` is a React component that renders a milestone celebration email
preview card. When a campaign reaches a funding milestone, creators can preview
and trigger a celebration email to contributors directly from the UI.

## Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `campaignTitle` | `string` | ✅ | Campaign name shown in the header |
| `creatorName` | `string` | ✅ | Name of the campaign creator |
| `currentPercent` | `number` | ✅ | Funding percentage (clamped to 0–100) |
| `totalRaised` | `number` | ✅ | Total amount raised so far |
| `goal` | `number` | ✅ | Campaign funding goal |
| `milestoneLabel` | `string` | ✅ | Human-readable milestone, e.g. `"Half Way There"` |
| `recipientName` | `string` | ❌ | Personalises the greeting; falls back to `"Hi there,"` |
| `onSend` | `(recipient: string) => void` | ❌ | Called with the recipient identifier when the CTA is clicked |

## Security Assumptions

- No `dangerouslySetInnerHTML` — all content is rendered as React text nodes.
- `recipientName` and `campaignTitle` are never interpolated into HTML strings.
- `currentPercent` is clamped to `[0, 100]` via `Math.min/max` before display.
- `onSend` receives a static string derived from `recipientName` or the literal
  `"contributor"`; no user-controlled HTML is passed.

## Accessibility

- The root element uses `role="region"` with `aria-label="Milestone Celebration Email Preview"`.
- The CTA button has an explicit `aria-label` that includes the recipient name.
- All text is rendered as plain React nodes — screen readers receive clean text.

## Usage Example

```tsx
import MilestoneEmail from "./milestone_emails";

<MilestoneEmail
  campaignTitle="Solar Panel Project"
  creatorName="Jane"
  currentPercent={50}
  totalRaised={5000}
  goal={10000}
  milestoneLabel="Half Way There"
  recipientName="Bob"
  onSend={(recipient) => console.log(`Sending to ${recipient}`)}
/>
```

## Test Coverage

Tests are in `milestone_emails.test.tsx` and cover:

- Rendering — title, milestone label, raised/goal amounts, creator name
- Personalization — greeting with and without `recipientName`
- CTA / onSend — callback invocation, graceful no-op when omitted
- Percent clamping — values above 100 and below 0
- Accessibility — region role, button aria-label

Target: **≥ 95% statement coverage**.
