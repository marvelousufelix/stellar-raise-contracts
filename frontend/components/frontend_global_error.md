# Frontend Global Error Boundary

Technical reference for the React global error boundary built for the Stellar Raise frontend.

---

## Overview

`FrontendGlobalErrorBoundary` is a React class component that catches synchronous render-phase errors anywhere in its wrapped component tree. It prevents full application crashes, classifies errors as generic or smart-contract related, emits structured and rate-limited log entries, and renders an appropriate fallback UI with a recovery path.

```
Error thrown → getDerivedStateFromError (state) →
componentDidCatch → sanitizeErrorMessage → boundaryRateLimiter.isAllowed()
  → console.error (structured) → onLog callback → onError callback
  → fallback UI
```

### Logging bounds

`componentDidCatch` emits at most **5** `console.error` calls per **60-second** rolling window (`LOG_RATE_LIMIT` / `LOG_RATE_WINDOW_MS`). Once the limit is reached, console output is suppressed for the remainder of the window. The `onError` callback is **always** invoked regardless of the rate limit, so no events are lost from external observability services.

This prevents log flooding when a component tree repeatedly throws (e.g. during a render loop or rapid retry cycles) and limits the risk of sensitive data appearing in high-volume log streams.

---

## Logging Bounds API

The boundary implements **multiple layers of bounds enforcement** to prevent information leakage and log exhaustion attacks:

### Rate Limiting

| Export | Type | Value | Description |
|--------|------|-------|-------------|
| `LOG_RATE_LIMIT` | `number` | `5` | Max console.error calls per window |
| `LOG_RATE_WINDOW_MS` | `number` | `60000` | Rolling window duration (ms) |
| `shouldLog(now?)` | `function` | `boolean` | Returns true if a log entry is allowed; accepts optional timestamp for testing |
| `_logState` | `object` | `{ count, windowStart }` | Internal rate-limit state (test use only) |
| `_resetLogState()` | `function` | `void` | Resets rate-limit state (test use only) |
| `boundaryRateLimiter` | `class` | singleton | Wraps shouldLog() and _resetLogState() for component integration |

### String Bounds

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_REPORT_MESSAGE_CHARS` | `500` | Truncates error messages forwarded to onError/onLog |
| `MAX_REPORT_STACK_CHARS` | `2000` | Truncates stack traces in dev mode |
| `MAX_REPORT_COMPONENT_STACK_CHARS` | `2000` | Truncates component call stacks in dev mode |
| `MAX_ERROR_NAME_CHARS` | `100` | Truncates error.name field |
| `MAX_DISPLAY_MESSAGE_CHARS` | `300` | Truncates UI details panel in dev mode |
| `MAX_THROWN_VALUE_STRING_CHARS` | `200` | String length limit when coercing non-Error values |
| `MAX_CLASSIFICATION_INPUT_CHARS` | `300` | Truncates haystack for keyword classification |

### Bounds Enforcement Logic

When a string exceeds its bound:

1. The string is sliced to `max` characters
2. An ellipsis (`…`) is appended
3. The final length is `max + 1` characters

Example:
```ts
truncateForBounds('very long error message', 10);
// → 'very long …'  (10 chars + ellipsis)
```

---

## Component API

```tsx
import {
  FrontendGlobalErrorBoundary,
  ContractError,
  NetworkError,
  TransactionError,
  boundaryRateLimiter,
  sanitizeErrorMessage,
} from '../components/frontend_global_error';
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `children` | `ReactNode` | No | Component tree to protect |
| `fallback` | `ReactNode` | No | Custom fallback UI; overrides built-in fallback entirely |
| `onError` | `(report: ErrorReport) => void` | No | Callback invoked with a sanitised error report on every caught error |
| `onLog` | `(entry: BoundaryLogEntry) => void` | No | Callback invoked with the full structured log entry (new) |

### ErrorReport shape

```ts
interface ErrorReport {
  message: string;
  stack: string | undefined;        // omitted in production
  componentStack: string | undefined; // omitted in production
  timestamp: string;                // ISO 8601
  isSmartContractError: boolean;
  errorName: string;
}
```

### BoundaryLogEntry shape

```ts
interface BoundaryLogEntry {
  timestamp: string;           // ISO 8601
  level: LogLevel;             // always 'error' for caught errors
  message: string;             // human-readable classification message
  errorMessage: string;        // sanitised error message (secrets redacted)
  errorName: string;           // e.g. 'ContractError', 'Error'
  isSmartContractError: boolean;
  componentStack?: string;     // omitted in production
  stack?: string;              // omitted in production
  sequence: number;            // monotonically increasing per boundary instance
}
```

---

## Custom Error Classes

Use these to signal specific failure domains to the boundary:

```tsx
// Smart contract execution failure
throw new ContractError('Insufficient funds for transaction');

// Network / Horizon API failure
throw new NetworkError('Horizon endpoint unreachable');

// Transaction signing / submission failure
throw new TransactionError('User rejected transaction in wallet');
```

All three extend `Error` and are automatically classified as smart-contract errors by the boundary.

---

## Logging Infrastructure

### Sanitisation

`sanitizeErrorMessage(message)` strips potentially sensitive data before any log entry is emitted:

- Long hex strings (potential private keys / hashes)
- Stellar account IDs (`G` + 55 base-32 chars)
- Base64 blobs (XDR payloads, JWT tokens)
- `secret_key: <value>` and `private_key: <value>` patterns

Matched substrings are replaced with `[REDACTED]`.

### Rate Limiting

`boundaryRateLimiter` is a module-level singleton that allows at most **5 console.error calls per 60-second fixed-window period**. When the limit is exceeded within a window:

- `console.error` is **suppressed** for the remainder of the window (includes our boundary log message)
- `onLog` callback is **still invoked** → observability systems receive all events
- `onError` callback is **still invoked** → error reports are complete
- The fallback UI is still rendered normally

**Implementation detail**: Uses a fixed-window counter strategy:

```ts
// Epoch: 0ms  10ms  20ms  30ms  40ms  ...
// Log#1: ✓   (window starts)
// Log#2: ✓
// Log#3: ✓
// Log#4: ✓
// Log#5: ✓   (limit reached)
// Log#6: ✗   (suppressed)
// Log#7: ✗   (suppressed)
// ...
// Log#60s+1: ✓  (new window opens)
```

This prevents unbounded log growth during crash loops while ensuring external observability systems capture every event via the callback APIs.

You can reset the limiter in tests:

```ts
import { _resetLogState } from '../components/frontend_global_error';
beforeEach(() => _resetLogState());
```


For other errors:
- ⚠️ Warning icon
- "Documentation Loading Error" title
- General error message
- Standard recovery options

`buildBoundaryLogEntry` produces a plain serialisable object safe to forward to any log aggregator:

- **Try Again**: Resets error state and re-renders children
- **Go Home**: Navigates to home page
- **Dismiss**: Resets error state without resolving the underlying issue — use only for transient errors
- **Error Details**: Expandable section in development mode

---

## Error Classification

The boundary classifies an error as a smart-contract error when:

1. It is an instance of `ContractError`, `NetworkError`, or `TransactionError`.
2. Its `name` or `message` contains any of these keywords (case-insensitive):
   `contract`, `stellar`, `soroban`, `transaction`, `blockchain`, `ledger`,
   `horizon`, `xdr`, `invoke`, `wallet`.

All other errors render the generic "Documentation Loading Error" fallback.

---

## Fallback UIs

### Generic fallback
- ⚠️ icon
- Title: "Documentation Loading Error"
- "Try Again" and "Go Home" buttons

### Smart contract fallback
- 🔗 icon
- Title: "Smart Contract Error"
- Blockchain-specific guidance (wallet balance, connectivity)
- "Try Again" and "Go Home" buttons

### Dev-only error details
In `NODE_ENV !== 'production'`, a collapsible `<details>` element shows the raw error message to aid debugging. This section is hidden in production to prevent information disclosure.

---

## Usage

### Basic

```tsx
import { FrontendGlobalErrorBoundary } from '../components/frontend_global_error';

function App() {
  return (
    <FrontendGlobalErrorBoundary>
      <MainApplication />
    </FrontendGlobalErrorBoundary>
  );
}
```

### With structured logging (Datadog / CloudWatch)

```tsx
<FrontendGlobalErrorBoundary
  onLog={(entry) => myLogAggregator.send(entry)}
  onError={(report) => Sentry.captureMessage(report.message, { extra: report })}
>
  <MainApplication />
</FrontendGlobalErrorBoundary>
```

### Throwing typed errors in contract components

```tsx
import { ContractError } from '../components/frontend_global_error';

async function contribute(amount: number) {
  try {
    await contract.invoke('contribute', { amount });
  } catch (err) {
    throw new ContractError(`Contribution failed: ${(err as Error).message}`);
  }
}
```

---

## Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Information disclosure | Stack traces and component stacks are omitted from `ErrorReport` and `BoundaryLogEntry` in production |
| Secret leakage in logs | `sanitizeErrorMessage` redacts hex keys, Stellar IDs, base64 blobs, and key patterns before logging |
| Log flooding | `boundaryRateLimiter` caps entries at 10 per 60 s; excess entries emit a single warning |
| XSS via error messages | Fallback UI renders error message as React text node (not `innerHTML`) |
| Sensitive contract data | Custom error classes should never embed private keys, XDR, or account secrets in the message |
| Async errors | The boundary does NOT catch errors in event handlers, `setTimeout`, or SSR — handle those separately |

---

## Limitations

- Cannot catch errors thrown inside the boundary's own `render` method.
- Does not catch async errors (event handlers, `Promise` rejections, `setTimeout`).
- Does not catch server-side rendering errors (use Next.js `_error.tsx` / `500.tsx` for those).
- Nested boundaries can be used for more granular isolation of subsections.

---

## Test Coverage

Tests live in `frontend/components/frontend_global_error.test.tsx` and cover:

- Custom error class instantiation and inheritance
- `sanitizeErrorMessage` — all redaction patterns and edge cases
- `isSmartContractError` — all keyword and type variants
- `BoundaryRateLimiter` — allow, block, and reset behaviour
- `buildBoundaryLogEntry` — shape, sanitisation, and dev/prod stack inclusion
- `buildErrorReport` — shape and field correctness
- Normal (no-error) rendering
- Generic error fallback rendering and logging
- Smart contract error detection (10 keyword/type variants)
- Custom fallback prop (generic and contract errors)
- Recovery via "Try Again" (success and persistent-error cases)
- `onError` callback with structured report validation
- `onLog` callback with `BoundaryLogEntry` validation
- Rate limiting — suppression, callback blocking, and post-reset recovery
- Accessibility (`role="alert"`, `aria-live`, `aria-label`, `aria-hidden`)
- Edge cases: empty message, TypeError, keyword matching

Target: ≥ 95% statement and line coverage, 100% function coverage.

---

## Integration with Next.js

```tsx
// pages/_app.tsx
import GlobalErrorBoundary from '../components/frontend_global_error';

function MyApp({ Component, pageProps }) {
  return (
    <GlobalErrorBoundary>
      <Component {...pageProps} />
    </GlobalErrorBoundary>
  );
}
```

The boundary handles client-side render errors. `pages/500.tsx` handles server-side errors. Both should be present for full coverage.

---

## Security Considerations

This implementation enforces **logging bounds and sanitization** to prevent information disclosure and denial-of-service attacks:

### 1. String Truncation

All error fields are truncated to bounded lengths **before** any logging occurs:

- Messages: max. 500 characters
- Stack traces: max. 2,000 characters
- Component stacks: max. 2,000 characters
- Error names: max. 100 characters

When a string exceeds its bound, it is sliced and suffixed with `…` for visual clarity.

**Rationale**: Prevents unbounded error messages (megabytes of data) from flooding logs or storage systems.

### 2. Sensitive Data Redaction

`sanitizeErrorMessage(message)` applies regex patterns to redact:

- **Stellar secret keys** — `S` followed by 55+ alphanumeric characters
- **Hex private keys** — 64-character hex strings (potential ED25519/ECDSA private key material)
- **Labeled secrets** — patterns like `secret=<value>`, `private_key: <value>`, `mnemonic: <value>`

Matched substrings are replaced with `[REDACTED]` **before** the message reaches any log aggregator.

**Limitation**: This is a best-effort heuristic. **Never log raw user input or JSON without sanitizing first.**

### 3. Rate Limiting

A fixed-window rate limiter allows **at most 5 console.error calls per 60-second window**. This is shared across all boundary instances in the same process.

- **Console output** is suppressed after the limit (prevents log spam)
- **onLog / onError callbacks** continue firing (preserves observability)
- **The UI continues to render** (does not disable error handling)

**Rationale**: Mitigates denial-of-service via log exhaustion. In a crash loop, logs grow linearly (not exponentially). Sensitive data cannot appear in high-volume log streams because the window caps output volume.

### 4. Production vs Development

In production mode (`NODE_ENV === 'production'`):

- Stack traces are **omitted** from `onError` reports
- Component stacks are **omitted** from `onError` reports
- Dev-only `<details>` sections in the UI are **not rendered**

This prevents source code paths, function names, and line numbers from being exposed to users (or leaking via error reports sent to external services).

In development, full stack traces are included to aid debugging.

### 5. Information Disclosure Prevention

The fallback UIs use only **static text and icons**. No raw error data appears in `innerHTML` or `eval()`-like contexts:

```tsx
// ✓ Safe: static message with bounded, sanitized error message
<p>{truncateForBounds(sanitizeErrorMessage(error.message), MAX_DISPLAY_MESSAGE_CHARS)}</p>

// ✗ Unsafe: user input in innerHTML
<div dangerouslySetInnerHTML={{ __html: error.message }} />
```

### 6. Best Practices for Callers

When using this boundary in production:

1. **Do not throw raw objects or unstructured data.**
   ```ts
   // ✓ Good
   throw new ContractError('Insufficient balance for transaction');

   // ✗ Bad
   throw { apiResponse: response, userInput: userForm };
   ```

2. **Configure onError to forward to your observability service** (Sentry, DataDog, CloudWatch):
   ```ts
   <FrontendGlobalErrorBoundary
     onError={(report) => {
       // report.message is already sanitized and truncated
       Sentry.captureException(new Error(report.message), {
         fingerprint: [report.errorName],
         tags: {
           isSmartContractError: report.isSmartContractError,
         },
       });
     }}
   >
   ```

3. **Test your onError integration with synthetic errors** to ensure secrets are not leaked:
   ```ts
   const secretKey = 'SCABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQR';
   throw new Error(`Secret key: ${secretKey}`);
   // → (redacted in report)
   ```

4. **Monitor the rate limit** — if you see many rate-limit suppressions in dev, it may indicate a crash loop or infinite retry cycle:
   ```ts
   // In tests or monitoring:
   import { _logState } from './frontend_global_error';
   console.log('Rate limit state:', _logState);
   // → { windowStart: 1234567890, count: 5 }
   ```

---

## Maintenance

### Updating Bounds

To adjust a bound constant (e.g., increase `MAX_REPORT_MESSAGE_CHARS`):

1. Update the constant in `frontend_global_error.tsx`
2. Update the corresponding test expectation in `frontend_global_error.test.tsx`
3. Run `npm test -- frontend/components/frontend_global_error` to verify coverage
4. Update this documentation (`frontend_global_error.md`)

Example:
```ts
// Before
export const MAX_REPORT_MESSAGE_CHARS = 500;

// After (if you need longer messages)
export const MAX_REPORT_MESSAGE_CHARS = 1000;
```

### Test Coverage

Target: ≥ 95% statement coverage. Run tests with:

```bash
npm test -- --coverage frontend/components/frontend_global_error
```
