# SubmitButton Component

Addresses [GitHub Issue #359](https://github.com/Crowdfunding-DApp/stellar-raise-contracts/issues/359).

A robust, accessible React submit button with full state management for crowdfunding transaction flows.

---

## Files

| File | Purpose |
|------|---------|
| `react_submit_button.tsx` | Component implementation |
| `react_submit_button.test.tsx` | Test suite (≥ 95% coverage) |
| `react_submit_button.md` | This document |

---

## States

The button moves through a deterministic state machine:

```
idle ──click──► loading ──resolve──► success ──resetDelay──► idle
                        └──reject──► error   ──resetDelay──► idle
```

| State | Visual | Interaction | Native `disabled` |
|-------|--------|-------------|-------------------|
| `idle` | Indigo | Clickable | No |
| `loading` | Light indigo + spinner | Blocked | Yes |
| `success` | Green + ✓ | Blocked | Yes |
| `error` | Red + retry label | Clickable (retry) | No |
| `disabled` | Grey, 60% opacity | Blocked | Yes |

---

## Usage

```tsx
import SubmitButton from "../components/react_submit_button";

<SubmitButton
  label="Fund Campaign"
  onClick={async () => {
    await submitTransaction();
  }}
/>
```

### With all options

```tsx
<SubmitButton
  label="Contribute"
  onClick={handleContribute}
  disabled={!walletConnected}
  resetDelay={3000}
  type="button"
  data-testid="contribute-btn"
/>
```

---

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | required | Button text in idle/disabled states |
| `onClick` | `() => Promise<void>` | required | Async handler; rejection triggers error state |
| `disabled` | `boolean` | `false` | External disabled flag |
| `resetDelay` | `number` | `2500` | ms before auto-reset from success/error |
| `type` | `"submit" \| "button" \| "reset"` | `"submit"` | HTML button type |
| `style` | `React.CSSProperties` | — | Extra inline styles |
| `data-testid` | `string` | — | Test selector |

---

## Security Assumptions

### Double-submit prevention
Clicks are silently ignored in `loading`, `success`, and `disabled` states. This prevents duplicate blockchain transactions (double-spend) when a user clicks repeatedly while a transaction is in-flight.

### No HTML injection
The `label` prop and all state labels are rendered as React text nodes, never via `dangerouslySetInnerHTML`. XSS via the label prop is not possible.

### No user-controlled styles
Background colours and cursors are sourced exclusively from the `STATE_CONFIG` constant. No user-supplied strings are interpolated into CSS values.

### Timer cleanup
The reset timer is cleared on component unmount via a `useEffect` cleanup function, preventing state updates on unmounted components and potential memory leaks.

### Negative `resetDelay` clamped
`Math.max(0, resetDelay)` ensures a negative value cannot cause unexpected behaviour.

---

## NatSpec-style Reference

### `SubmitButton`
- **@notice** Accessible submit button with idle / loading / success / error / disabled states.
- **@param** `label` — Text shown in idle and disabled states.
- **@param** `onClick` — Async handler; must return `Promise<void>`. Rejection triggers error state.
- **@param** `disabled` — When `true`, maps to the `disabled` state and blocks interaction.
- **@param** `resetDelay` — Milliseconds before auto-reset. Default `2500`. Clamped to `≥ 0`.
- **@security** Clicks are ignored in non-idle/non-error states (double-submit protection).
- **@security** Timer is cleaned up on unmount (memory-leak protection).

### `STATE_CONFIG`
- **@notice** Centralised visual configuration for each button state.
- **@dev** All colours are hardcoded hex values — no dynamic CSS injection.

### `ButtonState`
- **@notice** Union type: `"idle" | "loading" | "success" | "error" | "disabled"`.

---

## Test Coverage

Run with:

```bash
npm test -- --testPathPattern=react_submit_button --coverage
```

The suite covers:

- `STATE_CONFIG` completeness and correctness (14 tests)
- `ButtonState` type validation (3 tests)
- `SubmitButtonProps` interface (6 tests)
- State transition logic — all paths (8 tests)
- Security: double-submit prevention (3 tests)
- Accessibility attributes (5 tests)
- Display label logic including XSS edge case (6 tests)
- `resetDelay` edge cases (3 tests)
- Style configuration (3 tests)
- Integration: full lifecycle simulations (2 tests)
