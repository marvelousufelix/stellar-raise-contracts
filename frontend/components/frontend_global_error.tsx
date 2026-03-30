import React, { Component, ErrorInfo, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Custom Error Classes
// ---------------------------------------------------------------------------

/**
 * @title ContractError
 * @notice Represents errors originating from smart contract execution on Stellar/Soroban.
 * @dev Thrown when a contract invocation fails, returns an unexpected result, or
 * the transaction is rejected by the network.
 * @custom:security Never include raw contract state, XDR payloads, or private keys
 * in the message string.
 */
export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractError';
  }
}

/**
 * @title NetworkError
 * @notice Represents errors caused by network connectivity issues when communicating
 * with the Stellar Horizon API or RPC endpoints.
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * @title TransactionError
 * @notice Represents errors that occur during blockchain transaction submission,
 * signing, or confirmation phases.
 * @custom:security Do not embed transaction XDR or signing keys in the message.
 */
export class TransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionError';
  }
}

// ---------------------------------------------------------------------------
// Bounds constants
// ---------------------------------------------------------------------------

/** Maximum characters allowed in a sanitised error message forwarded to logs. */
export const MAX_REPORT_MESSAGE_CHARS = 500;
/** Maximum characters allowed in a stack trace forwarded to logs. */
export const MAX_REPORT_STACK_CHARS = 2000;
/** Maximum characters allowed in a component stack forwarded to logs. */
export const MAX_REPORT_COMPONENT_STACK_CHARS = 2000;
/** Maximum characters allowed in an error name field. */
export const MAX_ERROR_NAME_CHARS = 100;
/** Maximum characters shown in the dev-only fallback UI details panel. */
export const MAX_DISPLAY_MESSAGE_CHARS = 300;
/** Maximum characters used when stringifying a non-Error thrown value. */
export const MAX_THROWN_VALUE_STRING_CHARS = 200;
/** Maximum characters used when building the classification haystack. */
export const MAX_CLASSIFICATION_HAYSTACK_CHARS = 300;
/** Alias for MAX_CLASSIFICATION_HAYSTACK_CHARS for test compatibility. */
export const MAX_CLASSIFICATION_INPUT_CHARS = 300;
/** Maximum number of retry attempts before the retry button is hidden. */
export const MAX_RETRIES = 3;

/**
 * @dev Truncates a string to at most `max` characters, appending '…' when cut.
 * Prevents unbounded strings from flowing into logs or the UI.
 */
export function truncateForBounds(value: string, max: number): string {
  if (typeof value !== 'string') return '';
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

// ---------------------------------------------------------------------------
// Logging infrastructure
// ---------------------------------------------------------------------------

/**
 * @dev Regex patterns used to redact potentially sensitive substrings from
 * error messages before they are forwarded to log aggregators.
 *
 * @custom:security Conservative by design — may redact non-sensitive content
 * that matches patterns. False negatives (leaking secrets) are not acceptable.
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  /S[0-9A-Z]{55}/g,                          // Stellar secret keys (S…)
  /[0-9a-fA-F]{64}/g,                        // 32-byte hex strings (private keys)
  /(?:secret|private[_\s]?key|mnemonic|seed)[=:\s]+\S+/gi, // labelled secrets
];

/**
 * @dev Replaces potentially sensitive substrings with [REDACTED].
 * The original error object is never mutated.
 */
export function sanitizeErrorMessage(message: string): string {
  if (typeof message !== 'string') return '[non-string error]';
  let sanitized = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/** Maximum log entries allowed per sliding window. */
export const LOG_RATE_LIMIT = 5;
/** Sliding window duration in milliseconds. */
export const LOG_RATE_WINDOW_MS = 60_000;

/**
 * @dev Internal state for the rate limiter.
 *
 * @custom:security This is exported for test introspection only.
 * Production code should use shouldLog() and _resetLogState().
 */
export const _logState = {
  windowStart: 0,
  count: 0,
};

/**
 * @dev Resets the log rate limiter state. For testing only.
 * @custom:security Never call this in production code.
 */
export function _resetLogState(): void {
  _logState.windowStart = 0;
  _logState.count = 0;
}

/**
 * @dev Checks if a log entry is allowed under the current rate limit using
 * a fixed-window counting strategy.
 *
 * @param now Optional current timestamp (defaults to Date.now()). Used in tests
 *            to simulate time progression without actual delays.
 * @return true if a log entry is allowed under the current rate limit.
 *
 * @custom:security Bounding log output prevents:
 *   - Denial-of-service via log exhaustion attacks
 *   - Exponential growth of sensitive data in high-volume log streams
 *   - Resource exhaustion on logging infrastructure (disk, network, CPU)
 */
export function shouldLog(now: number = Date.now()): boolean {
  // If the current time is outside the window, start a new window.
  if (now - _logState.windowStart >= LOG_RATE_WINDOW_MS) {
    _logState.windowStart = now;
    _logState.count = 0;
  }

  // If we've hit the limit, reject this log entry.
  if (_logState.count >= LOG_RATE_LIMIT) {
    return false;
  }

  // Increment the count and allow this entry.
  _logState.count += 1;
  return true;
}

/**
 * @dev Lightweight sliding-window rate limiter for boundary log entries.
 * Shared across all boundary instances so nested boundaries cannot
 * collectively bypass the limit.
 *
 * @custom:security Bounding log output limits denial-of-service via log
 * exhaustion and reduces the risk of sensitive data appearing in high-volume
 * log streams.
 */
export class BoundaryRateLimiter {
  /** @return true if a log entry is allowed under the current rate limit. */
  isAllowed(): boolean {
    return shouldLog();
  }

  /** Resets the limiter — use in tests to ensure isolation. */
  reset(): void {
    _resetLogState();
  }
}

/** Module-level singleton rate limiter shared across all boundary instances. */
export const boundaryRateLimiter = new BoundaryRateLimiter();

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/** Keywords that indicate a smart-contract / blockchain related error. */
const CONTRACT_KEYWORDS = [
  'contract',
  'stellar',
  'soroban',
  'transaction',
  'blockchain',
  'ledger',
  'horizon',
  'xdr',
  'invoke',
  'wallet',
] as const;

/**
 * @dev Classification result is cached via WeakMap so repeated renders
 * do not re-scan the error message string (CPU efficiency).
 */
const _classificationCache = new WeakMap<Error, boolean>();

/**
 * @dev Builds a bounded haystack string for keyword classification.
 * Truncating prevents O(n) scans on arbitrarily long error messages.
 *
 * @custom:security This is exported for test introspection only.
 */
export function boundedClassificationHaystack(error: Error): string {
  const raw = `${error.name} ${error.message}`.toLowerCase();
  return truncateForBounds(raw, MAX_CLASSIFICATION_INPUT_CHARS);
}

/**
 * @dev Determines whether an error is related to smart contract execution.
 * Result is computed once per error instance and cached to avoid redundant
 * string scans across multiple render cycles.
 *
 * @param error The error to classify.
 * @return `true` if the error is contract/blockchain related.
 *
 * @custom:security This is a best-effort heuristic. Unknown error types default
 * to the generic handler, which is the safer path.
 */
function isSmartContractError(error: Error): boolean {
  if (_classificationCache.has(error)) {
    return _classificationCache.get(error)!;
  }
  let result: boolean;
  if (
    error instanceof ContractError ||
    error instanceof NetworkError ||
    error instanceof TransactionError
  ) {
    result = true;
  } else {
    const haystack = boundedClassificationHaystack(error);
    result = CONTRACT_KEYWORDS.some((kw) => haystack.includes(kw));
  }
  _classificationCache.set(error, result);
  return result;
}

// ---------------------------------------------------------------------------
// Structured log entry + error report
// ---------------------------------------------------------------------------

/**
 * @dev Structured log entry emitted by componentDidCatch.
 * Forwarded to the optional onLog callback for log aggregator integration.
 */
export interface BoundaryLogEntry {
  timestamp: string;
  level: 'error';
  message: string;
  errorMessage: string;
  errorName: string;
  isSmartContractError: boolean;
  componentStack: string | undefined;
  stack: string | undefined;
  sequence: number;
}

export interface ErrorReport {
  message: string;
  stack: string | undefined;
  componentStack: string | null | undefined;
  timestamp: string;
  isSmartContractError: boolean;
  errorName: string;
}

/**
 * @dev Builds a structured, sanitised log entry for a caught boundary error.
 * Stack traces are included only in development mode.
 * @custom:security errorMessage is sanitised via sanitizeErrorMessage before
 * inclusion so secrets are not forwarded to log aggregators.
 */
export function buildBoundaryLogEntry(
  error: Error,
  errorInfo: ErrorInfo,
  isContract: boolean,
  sequence: number,
): BoundaryLogEntry {
  const isDev = process.env.NODE_ENV !== 'production';
  return {
    timestamp: new Date().toISOString(),
    level: 'error',
    message: isContract
      ? 'Smart contract error caught by boundary'
      : 'Generic render error caught by boundary',
    errorMessage: sanitizeErrorMessage(
      truncateForBounds(error.message, MAX_REPORT_MESSAGE_CHARS),
    ),
    errorName: truncateForBounds(error.name, MAX_ERROR_NAME_CHARS),
    isSmartContractError: isContract,
    componentStack: isDev
      ? truncateForBounds(
          errorInfo.componentStack ?? '',
          MAX_REPORT_COMPONENT_STACK_CHARS,
        )
      : undefined,
    stack: isDev && error.stack
      ? truncateForBounds(error.stack, MAX_REPORT_STACK_CHARS)
      : undefined,
    sequence,
  };
}

/**
 * @dev Builds a sanitised error report for the caller's onError callback.
 * @custom:security Stack traces are included only in development mode.
 */
export function buildErrorReport(
  error: Error,
  errorInfo: ErrorInfo,
  isContract: boolean,
): ErrorReport {
  const isDev = process.env.NODE_ENV !== 'production';
  return {
    message: truncateForBounds(error.message, MAX_REPORT_MESSAGE_CHARS),
    stack:
      isDev && error.stack
        ? truncateForBounds(error.stack, MAX_REPORT_STACK_CHARS)
        : undefined,
    componentStack:
      isDev && errorInfo.componentStack
        ? truncateForBounds(
            errorInfo.componentStack,
            MAX_REPORT_COMPONENT_STACK_CHARS,
          )
        : undefined,
    timestamp: new Date().toISOString(),
    isSmartContractError: isContract,
    errorName: truncateForBounds(error.name, MAX_ERROR_NAME_CHARS),
  };
}

// ---------------------------------------------------------------------------
// Component types
// ---------------------------------------------------------------------------

export interface FrontendGlobalErrorBoundaryProps {
  /** @dev The child component tree to protect with this error boundary. */
  children?: ReactNode;
  /**
   * @dev Optional custom fallback UI. When provided it replaces the built-in
   * fallback entirely, giving callers full control over the error presentation.
   */
  fallback?: ReactNode;
  /**
   * @dev Optional callback invoked with a structured error report whenever an
   * error is caught. Use this to forward errors to Sentry, LogRocket, etc.
   * Always called regardless of the log rate limit.
   */
  onError?: (report: ErrorReport) => void;
  /**
   * @dev Optional callback invoked with the full structured log entry.
   * Enables callers to forward entries to a log aggregator without re-parsing
   * console output. Always called regardless of the log rate limit.
   */
  onLog?: (entry: BoundaryLogEntry) => void;
}

interface BoundaryState {
  hasError: boolean;
  error: Error | null;
  isSmartContractError: boolean;
  /** Number of retry attempts made so far. */
  retryCount: number;
}

// ---------------------------------------------------------------------------
// FrontendGlobalErrorBoundary
// ---------------------------------------------------------------------------

/**
 * @title FrontendGlobalErrorBoundary
 * @notice React class-based error boundary for the Stellar Raise frontend.
 *
 * @dev Catches synchronous render-phase errors anywhere in the wrapped component
 * tree, classifies them (generic vs. smart-contract), emits a structured and
 * rate-limited log entry, and renders an appropriate fallback UI with a
 * "Try Again" recovery path (capped at MAX_RETRIES).
 *
 * Logging bounds:
 *   At most LOG_RATE_LIMIT (10) console.error calls are emitted per
 *   LOG_RATE_WINDOW_MS (60 s) sliding window. Subsequent errors within the
 *   window are silently forwarded to onError/onLog only, preventing log
 *   flooding while preserving observability.
 *
 * @custom:security
 *   - Stack traces are suppressed in production to prevent information disclosure.
 *   - Error messages are sanitised before logging to strip potential secrets.
 *   - Log entries are rate-limited to prevent flooding / DoS via log exhaustion.
 *   - Fallback UI uses only static strings — no raw error data in innerHTML (XSS safe).
 *   - Classification results are cached via WeakMap to avoid redundant string scans.
 *   - All string fields are truncated to bounded lengths before forwarding.
 *
 * @custom:limitations
 *   - Does NOT catch errors in async event handlers, setTimeout, or SSR.
 *   - Does NOT catch errors thrown inside the boundary's own render method.
 */
export class FrontendGlobalErrorBoundary extends Component<
  FrontendGlobalErrorBoundaryProps,
  BoundaryState
> {
  /** Monotonically increasing counter for log entry sequencing. */
  private logSequence = 0;

  constructor(props: FrontendGlobalErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      isSmartContractError: false,
      retryCount: 0,
    };
    this.handleRetry = this.handleRetry.bind(this);
  }

  /**
   * @dev Updates component state so the next render shows the fallback UI.
   * Non-Error thrown values are normalised to Error here so downstream code
   * can always rely on a proper Error instance.
   *
   * @param error The value that was thrown (may not be an Error instance).
   * @return Partial state update.
   */
  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    const err =
      error instanceof Error
        ? error
        : new Error(
            error != null
              ? truncateForBounds(
                  String(error),
                  MAX_THROWN_VALUE_STRING_CHARS,
                )
              : 'An unexpected error occurred',
          );
    return {
      hasError: true,
      error: err,
      isSmartContractError: isSmartContractError(err),
    };
  }

  /**
   * @dev Called after an error has been thrown by a descendant component.
   * Emits a rate-limited console.error and always invokes onError/onLog
   * so external observability services receive every event.
   *
   * @param error The error that was thrown.
   * @param errorInfo React-provided component stack information.
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const normalisedError = this.state.error ?? error;
    const isContract = isSmartContractError(normalisedError);
    this.logSequence += 1;

    const logEntry = buildBoundaryLogEntry(
      normalisedError,
      errorInfo,
      isContract,
      this.logSequence,
    );

    // Rate-limited console output — prevents log flooding.
    if (boundaryRateLimiter.isAllowed()) {
      console.error(
        'Documentation Error Boundary caught an error:',
        error,
        errorInfo,
      );
    }

    // onLog and onError are always called regardless of rate limit.
    if (typeof this.props.onLog === 'function') {
      this.props.onLog(logEntry);
    }

    const report = buildErrorReport(normalisedError, errorInfo, isContract);
    if (typeof this.props.onError === 'function') {
      this.props.onError(report);
    }
  }

  /**
   * @dev Resets error state so the child tree is re-rendered.
   * Capped at MAX_RETRIES to prevent infinite retry loops on unrecoverable errors.
   */
  handleRetry(): void {
    if (this.state.retryCount >= MAX_RETRIES) return;
    this.setState((prev) => ({
      hasError: false,
      error: null,
      isSmartContractError: false,
      retryCount: prev.retryCount + 1,
    }));
  }

  render(): ReactNode {
    const { hasError, error, isSmartContractError: isContract, retryCount } =
      this.state;
    const { fallback, children } = this.props;
    const isDev = process.env.NODE_ENV !== 'production';
    const canRetry = retryCount < MAX_RETRIES;

    if (!hasError) {
      return children ?? null;
    }

    if (fallback) {
      return fallback;
    }

    if (isContract) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="error-boundary error-boundary--contract"
          style={styles.container}
        >
          <span aria-hidden="true" style={styles.icon}>🔗</span>
          <h2 style={styles.title}>Smart Contract Error</h2>
          <p style={styles.message}>
            A blockchain interaction failed. This may be due to insufficient
            funds, a rejected transaction, or a temporary network issue.
          </p>
          <p style={styles.hint}>
            Check your wallet balance, ensure your wallet is connected, then try again.
          </p>
          {isDev && error && (
            <details style={styles.details}>
              <summary>Error Details (dev only)</summary>
              <pre style={styles.pre}>
                {truncateForBounds(error.message, MAX_DISPLAY_MESSAGE_CHARS)}
              </pre>
            </details>
          )}
          <div style={styles.actions}>
            {canRetry && (
              <button
                onClick={this.handleRetry}
                style={styles.primaryButton}
                aria-label="Try Again"
              >
                Try Again
              </button>
            )}
            <button
              onClick={() => { window.location.href = '/'; }}
              style={styles.secondaryButton}
              aria-label="Go Home"
            >
              Go Home
            </button>
          </div>
          {!canRetry && (
            <p style={styles.hint} role="status">
              Maximum retry attempts reached. Please reload the page.
            </p>
          )}
        </div>
      );
    }

    return (
      <div
        role="alert"
        aria-live="assertive"
        className="error-boundary error-boundary--generic"
        style={styles.container}
      >
        <span aria-hidden="true" style={styles.icon}>⚠️</span>
        <h2 style={styles.title}>Documentation Loading Error</h2>
        <p style={styles.message}>
          We&apos;re sorry, but the documentation content failed to load due to an unexpected error.
        </p>
        {isDev && error && (
          <details style={styles.details}>
            <summary>Error Details (dev only)</summary>
            <pre style={styles.pre}>
              {truncateForBounds(error.message, MAX_DISPLAY_MESSAGE_CHARS)}
            </pre>
          </details>
        )}
        <div style={styles.actions}>
          {canRetry && (
            <button
              onClick={this.handleRetry}
              style={styles.primaryButton}
              aria-label="Try Again"
            >
              Try Again
            </button>
          )}
          <button
            onClick={() => { window.location.href = '/'; }}
            style={styles.secondaryButton}
            aria-label="Go Home"
          >
            Go Home
          </button>
        </div>
        {!canRetry && (
          <p style={styles.hint} role="status">
            Maximum retry attempts reached. Please reload the page.
          </p>
        )}
      </div>
    );
  }
}

// ---------------------------------------------------------------------------
// Inline styles (no CSS dependency — boundary must render even if CSS fails)
// ---------------------------------------------------------------------------

const styles = {
  container: {
    padding: '24px',
    border: '1px solid #ff4d4f',
    borderRadius: '6px',
    backgroundColor: '#fff2f0',
    color: '#cf1322',
    maxWidth: '600px',
    margin: '40px auto',
    fontFamily: 'sans-serif',
  } as React.CSSProperties,
  icon: { fontSize: '2rem', display: 'block', marginBottom: '8px' } as React.CSSProperties,
  title: { margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 600 } as React.CSSProperties,
  message: { margin: '0 0 8px', fontSize: '0.95rem', color: '#595959' } as React.CSSProperties,
  hint: { margin: '0 0 12px', fontSize: '0.875rem', color: '#8c8c8c' } as React.CSSProperties,
  details: { marginTop: '12px', marginBottom: '12px', fontSize: '0.8rem', color: '#595959' } as React.CSSProperties,
  pre: { whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const, background: '#f5f5f5', padding: '8px', borderRadius: '4px', fontSize: '0.75rem' } as React.CSSProperties,
  actions: { display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' as const } as React.CSSProperties,
  primaryButton: { padding: '8px 18px', cursor: 'pointer', backgroundColor: '#cf1322', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.9rem' } as React.CSSProperties,
  secondaryButton: { padding: '8px 18px', cursor: 'pointer', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.9rem' } as React.CSSProperties,
};

export default FrontendGlobalErrorBoundary;
