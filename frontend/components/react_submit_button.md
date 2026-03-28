# ReactSubmitButton

A typed React submit button with a strict state machine, safe label handling,
double-submit prevention, and ARIA accessibility semantics.

Refactored for CI/CD readability: `useState` replaced with `useReducer`,
`onClick` stabilised with `useCallback`, and an `isMounted` ref guard added
to prevent state updates after unmount.

---

## States

| State        | Description                                      | Clickable |
|--------------|--------------------------------------------------|-----------|
| `idle`       | Default — ready to submit                        | ✅        |
| `submitting` | Async action in-flight; blocks interaction       | ❌        |
| `success`    | Action confirmed; blocks re-submission           | ❌        |
| `error`      | Action failed; user can retry                    | ✅        |
| `disabled`   | Externally locked (deadline passed, goal met…)   | ❌        |

### Allowed transitions

```
idle        → submitting | disabled
submitting  → success | error | disabled
success     → idle | disabled
error       → idle | submitting | disabled
disabled    → idle
```

Same-state updates are always allowed (idempotent).

---

## Props

| Prop                | Type                                              | Default      | Description                                              |
|---------------------|---------------------------------------------------|--------------|----------------------------------------------------------|
| `state`             | `SubmitButtonState`                               | —            | Current button state (required)                          |
| `previousState`     | `SubmitButtonState`                               | `undefined`  | Previous state for strict transition validation          |
| `strictTransitions` | `boolean`                                         | `true`       | Falls back to `previousState` on invalid transitions     |
| `labels`            | `SubmitButtonLabels`                              | `undefined`  | Per-state label overrides                                |
| `onClick`           | `(e: MouseEvent) => void \| Promise<void>`        | `undefined`  | Click handler; blocked while submitting/disabled         |
| `className`         | `string`                                          | `undefined`  | Additional CSS class                                     |
| `id`                | `string`                                          | `undefined`  | HTML `id` attribute                                      |
| `type`              | `"button" \| "submit" \| "reset"`                 | `"button"`   | HTML button type                                         |
| `disabled`          | `boolean`                                         | `undefined`  | External disabled override                               |

---

## Default labels

| State        | Label             |
|--------------|-------------------|
| `idle`       | `Submit`          |
| `submitting` | `Submitting...`   |
| `success`    | `Submitted`       |
| `error`      | `Try Again`       |
| `disabled`   | `Submit Disabled` |

---

## Usage

```tsx
import ReactSubmitButton from "./react_submit_button";

// Basic
<ReactSubmitButton state="idle" onClick={handleSubmit} />

// With custom labels
<ReactSubmitButton
  state={txState}
  previousState={prevTxState}
  labels={{ idle: "Fund Campaign", submitting: "Funding...", success: "Funded!" }}
  onClick={handleContribute}
/>

// Externally disabled (e.g. campaign deadline passed)
<ReactSubmitButton state="disabled" labels={{ disabled: "Campaign Ended" }} />
```

---

## Refactor notes (CI/CD)

### useReducer replaces useState

The local `isLocallySubmitting` flag is now managed by `submitButtonReducer`.
This makes state transitions explicit and grep-able in CI logs:

```ts
// Before
const [isLocallySubmitting, setIsLocallySubmitting] = useState(false);

// After
const [{ isLocallySubmitting }, dispatch] = useReducer(submitButtonReducer, {
  isLocallySubmitting: false,
});
dispatch({ type: "START_SUBMIT" });
dispatch({ type: "END_SUBMIT" });
```

`submitButtonReducer` is exported so CI can test it in isolation without
mounting a component.

### useCallback stabilises handleClick

`handleClick` is wrapped in `useCallback` with `[blocked, onClick]` as deps.
Parent components that pass `handleClick` to `useEffect` or `useMemo` no longer
re-run those hooks on every render.

### isMounted ref guard

A `isMountedRef` prevents `dispatch({ type: "END_SUBMIT" })` from firing after
the component unmounts during a slow async `onClick`. This eliminates the
React "setState on unmounted component" warning in CI test output.

### inFlight ref guard

`inFlightRef` is checked at the top of `handleClick` to block double-submit
even if the parent re-renders the component with `state="idle"` while an async
handler is still in-flight.

---

## Exported helpers

All pure functions are exported for independent unit testing.

| Export                                | Purpose                                                        |
|---------------------------------------|----------------------------------------------------------------|
| `submitButtonReducer`                 | Pure reducer for local submitting state (new)                  |
| `normalizeSubmitButtonLabel`          | Sanitises a label: strips control chars, truncates to 80 chars |
| `resolveSubmitButtonLabel`            | Returns the safe label for a given state                       |
| `isValidSubmitButtonStateTransition`  | Validates a `from → to` state transition                       |
| `resolveSafeSubmitButtonState`        | Enforces strict transitions, falls back to `previousState`     |
| `isSubmitButtonInteractionBlocked`    | Returns `true` when clicks must be suppressed                  |
| `isSubmitButtonBusy`                  | Returns `true` when `aria-busy` should be set                  |
| `ALLOWED_TRANSITIONS`                 | Transition map (shared by component and tests)                 |
| `DEFAULT_LABELS`                      | Default label map (shared by component and tests)              |
| `MAX_LABEL_LENGTH`                    | Label truncation constant (shared by component and tests)      |

---

## Security assumptions

- **No `dangerouslySetInnerHTML`** — labels are rendered as React text nodes only.
- **Label sanitisation** — control characters (`U+0000–U+001F`, `U+007F`) are
  stripped; labels are truncated to `MAX_LABEL_LENGTH` (80) to prevent layout abuse.
- **Double-submit prevention** — `inFlightRef` blocks re-entry while an async
  `onClick` is in-flight, preventing duplicate blockchain transactions even if
  the parent re-renders with `state="idle"` mid-flight.
- **isMounted guard** — `dispatch` is skipped after unmount to prevent memory
  leaks and spurious React warnings in CI.
- **Hardcoded styles** — all CSS values are compile-time constants; no dynamic
  style injection from user input.
- **Input validation is the caller's responsibility** — the component surfaces
  state only; it never submits data itself.

---

## Accessibility

- `aria-live="polite"` — state label changes are announced to screen readers.
- `aria-busy` — set to `true` while submitting.
- `aria-label` — always set to the resolved, sanitised label.
- `disabled` — set on the HTML element when interaction is blocked, preventing
  keyboard activation.

---

## Tests

```
frontend/components/react_submit_button.test.tsx
```

Run:

```bash
npx jest frontend/components/react_submit_button.test.tsx
```

### Coverage (≥ 95%)

| Area                                        | Cases |
|---------------------------------------------|-------|
| `submitButtonReducer`                       | 3     |
| `normalizeSubmitButtonLabel`                | 8     |
| `resolveSubmitButtonLabel`                  | 5     |
| `isValidSubmitButtonStateTransition`        | 3     |
| `resolveSafeSubmitButtonState`              | 6     |
| `isSubmitButtonInteractionBlocked`          | 6     |
| `isSubmitButtonBusy`                        | 3     |
| Rendering                                   | 9     |
| Disabled / blocked states                   | 5     |
| Accessibility attributes                    | 4     |
| Click handling (incl. double-submit, async) | 9     |
| Strict transition enforcement               | 4     |
| isMounted guard (unmount during async)      | 1     |
| **Total**                                   | **66**|
