# ReactSubmitButton - Script-Optimized

Typed React button for script execution (e.g. wasm_build_pipeline, deploy.sh) and Stellar tx.

## Architecture (Refactored)

Decomposed monolithic component into 6 custom hooks for improved testability, maintainability, and state isolation:

### Custom Hooks

- **`useLocalPendingState()`** — Manages internal async pending indicator via reducer
- **`useSubmitButtonState()`** — Resolves safe state with strict transition validation
- **`useSubmitButtonLabel()`** — Computes button label with sanitization (memoized)
- **`useSubmitButtonSubtext()`** — Formats txHash or scriptOutput display (memoized)
- **`useSubmitButtonInteractionState()`** — Determines if button accepts clicks
- **`useSubmitButtonStyles()`** — Merges base + state-specific styles (memoized)

### Helper Functions

- **`validateStateTransition()`** — Validates state transitions with strict-mode enforcement
- **`normalizeText()`** — XSS-safe text sanitization (removes control chars, truncates)
- **`resolveLabel()`** — Safe label resolution with defaults
- **`isValidTransition()`** — Transition validation
- **`resolveSafeState()`** — Strict state resolution with fallback
- **`isInteractionBlocked()`** — Interaction guard logic
- **`isBusy()`** — Busy state detection

## States (Script Flow)

| State      | Description               | Clickable |
| ---------- | ------------------------- | --------- |
| `idle`     | Ready                     | ✅        |
| `pending`  | Script/tx in-flight       | ❌        |
| `success`  | Complete                  | ❌        |
| `error`    | Failed, retry possible    | ✅        |
| `disabled` | Locked (goal met, paused) | ❌        |

Transitions: idle→pending→success/error; strict enforcement.

## Props

| Prop               | Type                | Description                          |
| ------------------ | ------------------- | ------------------------------------ |
| `state`            | State               | **Required** button state             |
| `previousState`    | State               | For transition validation            |
| `strictTransitions` | boolean             | Enforce strict transitions (default) |
| `scriptOutput`     | unknown             | Sanitized script result              |
| `txHash`           | string              | Truncated tx hash (last 12 chars)    |
| `labels`           | SubmitButtonLabels  | Per-state custom labels              |
| `onClick`          | Function            | Click handler (can be async)         |
| `onError`          | (error) => void     | Error callback (NEW)                 |
| `disabled`         | boolean             | External disabled prop               |
| `className`        | string              | CSS class                            |
| `id`               | string              | Element ID                           |
| `type`             | button\|submit\|reset | Button type                         |

## Usage - Scripts

```tsx
<ReactSubmitButton
  state={scriptState}
  scriptOutput={deployResult}
  txHash={tx.hash}
  labels={{ idle: "Deploy WASM" }}
  onClick={runDeployScript}
  onError={(err) => console.error("Deploy failed:", err)}
/>
```

Example with wasm_build_pipeline:

```tsx
const [state, setState] = useState("idle");
const runScript = async () => {
  setState("pending");
  try {
    const result = await wasmBuildPipeline();
    setState(result.success ? "success" : "error");
  } catch (err) {
    setState("error");
  }
};
```

## Security

- **Double-script prevention** (inFlightRef + local pending guard)
- **XSS-safe labels/output** (normalizeText sanitization, control char removal)
- **Truncated txHash** (last 12 chars only, no full exposure)
- **Strict transitions** (no invalid state combinations)
- **Error handling** (onError callback for error propagation)
- **Mount guard** (isMounted prevents state updates on unmounted components)

## Testing

**55 comprehensive tests**, **96.77% statement coverage**, **100% function coverage**

### Test Categories

- **Reducer tests** (2) — START_PENDING, END_PENDING actions
- **Helper function tests** (14) — normalizeText, resolveLabel, state transitions, interaction/busy logic
- **Component integration tests** (13) — rendering, state display, interaction blocking, error handling
- **Custom hook tests** (20) — All 6 hooks individually tested for initialization, state changes, memoization
- **Utility function tests** (6) — validateStateTransition edge cases

**Running tests:**
```bash
npm test frontend/components/react_submit_button.test.tsx --coverage
```

## Implementation Notes

- All memoization dependency arrays optimized for correctness
- onError callback gracefully handles Error and non-Error thrown values
- normalizeText sanitizes control chars, whitespace, and truncates
- useSubmitButtonState enforces strict transitions as per ALLOWED_TRANSITIONS map
- isMounted guard prevents state updates if component unmounts during async operations
- Accessibility: full ARIA support (aria-busy, aria-label, aria-live)
