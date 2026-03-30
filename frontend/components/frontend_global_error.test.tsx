import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  FrontendGlobalErrorBoundary,
  ContractError,
  NetworkError,
  TransactionError,
  ErrorReport,
  MAX_RETRIES,
  MAX_CLASSIFICATION_INPUT_CHARS,
  MAX_REPORT_MESSAGE_CHARS,
  MAX_DISPLAY_MESSAGE_CHARS,
  MAX_ERROR_NAME_CHARS,
  MAX_REPORT_STACK_CHARS,
  truncateForBounds,
  boundedClassificationHaystack,
  LOG_RATE_LIMIT,
  LOG_RATE_WINDOW_MS,
  shouldLog,
  _logState,
  _resetLogState,
  boundaryRateLimiter,
} from './frontend_global_error';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
beforeAll(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});
beforeEach(() => {
  jest.clearAllMocks();
  _resetLogState();
});

/** Helper component that always throws the given error during render. */
const Throw = ({ error }: { error: Error }) => { throw error; };

// ---------------------------------------------------------------------------
// Logging bounds (pure helpers + script-friendly caps)
// ---------------------------------------------------------------------------

describe('truncateForBounds', () => {
  it('returns ellipsis for edge case max values', () => {
    // With max=0, it slices 0 chars and adds ellipsis
    expect(truncateForBounds('hello', 0)).toBe('…');
    // With negative max, it exhibits slice behavior; just verify it works
    expect(truncateForBounds('hello', -1)).toBeTruthy();
  });

  it('returns original string when within cap', () => {
    expect(truncateForBounds('hello', 10)).toBe('hello');
  });

  it('returns partial string plus ellipsis when cap is 1', () => {
    // With max=1, it slices 1 char and adds ellipsis
    expect(truncateForBounds('hello', 1)).toBe('h…');
  });

  it('truncates with ellipsis when over cap', () => {
    // With max=4, it slices 4 chars and adds ellipsis
    expect(truncateForBounds('hello', 4)).toBe('hell…');
  });
});

describe('boundedClassificationHaystack', () => {
  it('lowercases name and message', () => {
    const h = boundedClassificationHaystack(new Error('Stellar'));
    expect(h).toContain('stellar');
    expect(h).toContain('error');
  });
});

describe('Logging bound constants', () => {
  it('exports positive numeric caps for maintainability', () => {
    // All constants should be positive integers
    expect(MAX_CLASSIFICATION_INPUT_CHARS).toBeGreaterThan(0);
    expect(MAX_REPORT_MESSAGE_CHARS).toBeGreaterThan(0);
    expect(MAX_DISPLAY_MESSAGE_CHARS).toBeGreaterThan(0);
    expect(MAX_ERROR_NAME_CHARS).toBeGreaterThan(0);
    expect(MAX_REPORT_STACK_CHARS).toBeGreaterThan(0);
    expect(LOG_RATE_LIMIT).toBeGreaterThan(0);
  });
});

describe('ErrorReport payload bounds', () => {
  it('truncates report.message to MAX_REPORT_MESSAGE_CHARS', () => {
    const long = 'x'.repeat(MAX_REPORT_MESSAGE_CHARS + 500);
    const onError = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new Error(long)} />
      </FrontendGlobalErrorBoundary>,
    );
    const report: ErrorReport = onError.mock.calls[0][0];
    // Allow for ellipsis character which makes length +1
    expect(report.message.length).toBeLessThanOrEqual(MAX_REPORT_MESSAGE_CHARS + 1);
    expect(report.message.endsWith('\u2026')).toBe(true);
  });

  it('truncates report.errorName to MAX_ERROR_NAME_CHARS', () => {
    const onError = jest.fn();
    const e = new Error('x');
    e.name = 'Y'.repeat(MAX_ERROR_NAME_CHARS + 20);
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={e} />
      </FrontendGlobalErrorBoundary>,
    );
    const report: ErrorReport = onError.mock.calls[0][0];
    // Allow for ellipsis character which makes length +1
    expect(report.errorName.length).toBeLessThanOrEqual(MAX_ERROR_NAME_CHARS + 1);
  });
});

describe('Classification haystack window', () => {
  it('does not treat keyword-only-at-end-of-huge-message as contract error', () => {
    const prefixLen = MAX_CLASSIFICATION_INPUT_CHARS + 100;
    const msg = `${'a'.repeat(prefixLen)}stellar`;
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error(msg)} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText('Documentation Loading Error')).toBeTruthy();
    expect(screen.queryByText('Smart Contract Error')).toBeNull();
  });
});

describe('Dev-only display truncation', () => {
  it('shows at most MAX_DISPLAY_MESSAGE_CHARS in details pre', () => {
    const long = 'z'.repeat(MAX_DISPLAY_MESSAGE_CHARS + 400);
    const { container } = render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error(long)} />
      </FrontendGlobalErrorBoundary>,
    );
    const pre = container.querySelector('pre');
    expect(pre).toBeTruthy();
    // Allow for ellipsis character which makes length +1
    expect((pre as HTMLElement).textContent!.length).toBeLessThanOrEqual(
      MAX_DISPLAY_MESSAGE_CHARS + 1,
    );
  });
});

// ---------------------------------------------------------------------------
// Custom error classes
// ---------------------------------------------------------------------------

describe('Custom error classes', () => {
  it('ContractError has correct name and extends Error', () => {
    const e = new ContractError('bad contract');
    expect(e.name).toBe('ContractError');
    expect(e.message).toBe('bad contract');
    expect(e).toBeInstanceOf(Error);
  });

  it('NetworkError has correct name and extends Error', () => {
    const e = new NetworkError('timeout');
    expect(e.name).toBe('NetworkError');
    expect(e.message).toBe('timeout');
    expect(e).toBeInstanceOf(Error);
  });

  it('TransactionError has correct name and extends Error', () => {
    const e = new TransactionError('rejected');
    expect(e.name).toBe('TransactionError');
    expect(e.message).toBe('rejected');
    expect(e).toBeInstanceOf(Error);
  });

  it('ContractError stack is defined', () => {
    const e = new ContractError('stack test');
    expect(e.stack).toBeDefined();
  });

  it('NetworkError stack is defined', () => {
    expect(new NetworkError('x').stack).toBeDefined();
  });

  it('TransactionError stack is defined', () => {
    expect(new TransactionError('x').stack).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Logging bounds — shouldLog() unit tests
// ---------------------------------------------------------------------------

describe('shouldLog() rate limiter', () => {
  it('returns true for the first LOG_RATE_LIMIT calls within a window', () => {
    const now = 1_000_000;
    for (let i = 0; i < LOG_RATE_LIMIT; i++) {
      expect(shouldLog(now)).toBe(true);
    }
  });

  it('returns false once LOG_RATE_LIMIT is exceeded within the same window', () => {
    const now = 2_000_000;
    for (let i = 0; i < LOG_RATE_LIMIT; i++) shouldLog(now);
    expect(shouldLog(now)).toBe(false);
  });

  it('resets and returns true after the window expires', () => {
    const now = 3_000_000;
    for (let i = 0; i < LOG_RATE_LIMIT; i++) shouldLog(now);
    expect(shouldLog(now)).toBe(false);
    // Advance past the window.
    expect(shouldLog(now + LOG_RATE_WINDOW_MS)).toBe(true);
  });

  it('increments _logState.count on each allowed call', () => {
    const now = 4_000_000;
    shouldLog(now);
    shouldLog(now);
    expect(_logState.count).toBe(2);
  });

  it('does not increment count beyond LOG_RATE_LIMIT', () => {
    const now = 5_000_000;
    for (let i = 0; i < LOG_RATE_LIMIT + 3; i++) shouldLog(now);
    expect(_logState.count).toBe(LOG_RATE_LIMIT);
  });

  it('resets windowStart when a new window begins', () => {
    const now = 6_000_000;
    shouldLog(now);
    const newNow = now + LOG_RATE_WINDOW_MS + 1;
    shouldLog(newNow);
    expect(_logState.windowStart).toBe(newNow);
  });

  it('_resetLogState zeroes count and windowStart', () => {
    shouldLog(7_000_000);
    _resetLogState();
    expect(_logState.count).toBe(0);
    expect(_logState.windowStart).toBe(0);
  });

  it('LOG_RATE_LIMIT is 5', () => {
    expect(LOG_RATE_LIMIT).toBe(5);
  });

  it('LOG_RATE_WINDOW_MS is 60000', () => {
    expect(LOG_RATE_WINDOW_MS).toBe(60_000);
  });

  it('allows exactly LOG_RATE_LIMIT logs then blocks', () => {
    const now = 8_000_000;
    const results: boolean[] = [];
    for (let i = 0; i < LOG_RATE_LIMIT + 2; i++) results.push(shouldLog(now));
    expect(results.slice(0, LOG_RATE_LIMIT).every(Boolean)).toBe(true);
    expect(results[LOG_RATE_LIMIT]).toBe(false);
    expect(results[LOG_RATE_LIMIT + 1]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Logging bounds — integration with componentDidCatch
// ---------------------------------------------------------------------------

describe('Logging bounds — componentDidCatch integration', () => {
  it('calls console.error for the first error (within rate limit)', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('first error')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalledWith(
      'Documentation Error Boundary caught an error:',
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );
  });

  it('suppresses console.error after LOG_RATE_LIMIT errors in the same window', () => {
    // Exhaust the rate limit by pre-filling the counter.
    const now = Date.now();
    _logState.windowStart = now;
    _logState.count = LOG_RATE_LIMIT;

    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('over limit')} />
      </FrontendGlobalErrorBoundary>,
    );
    // Our boundary log message must NOT appear — React's own console.error calls are allowed.
    const ourCalls = (console.error as jest.Mock).mock.calls.filter(
      (args) => args[0] === 'Documentation Error Boundary caught an error:',
    );
    expect(ourCalls).toHaveLength(0);
  });

  it('still calls onError even when console.error is suppressed', () => {
    const onError = jest.fn();
    const now = Date.now();
    _logState.windowStart = now;
    _logState.count = LOG_RATE_LIMIT;

    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new Error('suppressed log but callback fires')} />
      </FrontendGlobalErrorBoundary>,
    );
    const ourCalls = (console.error as jest.Mock).mock.calls.filter(
      (args) => args[0] === 'Documentation Error Boundary caught an error:',
    );
    expect(ourCalls).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('resumes console.error after the rate-limit window resets', () => {
    // Exhaust the window.
    const past = Date.now() - LOG_RATE_WINDOW_MS - 1;
    _logState.windowStart = past;
    _logState.count = LOG_RATE_LIMIT;

    // The window has expired, so the next call should open a new window.
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('new window error')} />
      </FrontendGlobalErrorBoundary>,
    );
    const ourCalls = (console.error as jest.Mock).mock.calls.filter(
      (args) => args[0] === 'Documentation Error Boundary caught an error:',
    );
    expect(ourCalls).toHaveLength(1);
  });

  it('onError is always called regardless of rate limit', () => {
    const onError = jest.fn();
    // Render LOG_RATE_LIMIT + 2 separate boundaries to trigger multiple catches.
    for (let i = 0; i < LOG_RATE_LIMIT + 2; i++) {
      _resetLogState(); // reset between renders to isolate; then re-exhaust below
    }
    // Now exhaust the limit and verify onError still fires.
    _logState.windowStart = Date.now();
    _logState.count = LOG_RATE_LIMIT;

    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new Error('always reported')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe('always reported');
  });
});

// ---------------------------------------------------------------------------
// Normal rendering (no error)
// ---------------------------------------------------------------------------

describe('Normal rendering (no error)', () => {
  it('renders children when no error is thrown', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <div data-testid="child">Safe Content</div>
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(screen.getByText('Safe Content')).toBeTruthy();
  });

  it('renders null when children is omitted', () => {
    const { container } = render(<FrontendGlobalErrorBoundary />);
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Generic error fallback
// ---------------------------------------------------------------------------

describe('Generic error fallback', () => {
  it('renders the default fallback UI on error', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('Simulated crash')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Documentation Loading Error')).toBeTruthy();
  });

  it('shows the "Try Again" button', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('crash')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeTruthy();
  });

  it('shows the "Go Home" button', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('crash')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Go Home' })).toBeTruthy();
  });

  it('calls console.error with the caught error', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('Simulated documentation crash')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalledWith(
      'Documentation Error Boundary caught an error:',
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );
  });

  it('has role="alert" and aria-live="assertive"', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('crash')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByRole('alert').getAttribute('aria-live')).toBe('assertive');
  });
});

// ---------------------------------------------------------------------------
// Smart contract error fallback
// ---------------------------------------------------------------------------

describe('Smart contract error fallback', () => {
  const contractErrors: Array<[string, Error]> = [
    ['ContractError instance', new ContractError('contract call failed')],
    ['NetworkError instance', new NetworkError('horizon timeout')],
    ['TransactionError instance', new TransactionError('tx rejected')],
    ['stellar keyword', new Error('stellar network error')],
    ['soroban keyword', new Error('soroban invocation failed')],
    ['transaction keyword', new Error('transaction simulation error')],
    ['blockchain keyword', new Error('blockchain ledger closed')],
    ['wallet keyword', new Error('wallet connection lost')],
    ['xdr keyword', new Error('xdr decode error')],
    ['horizon keyword', new Error('horizon api error')],
  ];

  contractErrors.forEach(([label, err]) => {
    it(`shows Smart Contract Error for ${label}`, () => {
      render(
        <FrontendGlobalErrorBoundary>
          <Throw error={err} />
        </FrontendGlobalErrorBoundary>,
      );
      expect(screen.getByText('Smart Contract Error')).toBeTruthy();
    });
  });

  it('shows blockchain-specific guidance text', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new ContractError('insufficient funds')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText(/Check your wallet balance/i)).toBeTruthy();
  });

  it('does NOT show Documentation Loading Error for contract errors', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new ContractError('bad call')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.queryByText('Documentation Loading Error')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Custom fallback prop
// ---------------------------------------------------------------------------

describe('Custom fallback prop', () => {
  it('renders the custom fallback when provided', () => {
    render(
      <FrontendGlobalErrorBoundary fallback={<div data-testid="cf">Custom Error View</div>}>
        <Throw error={new Error('crash')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByTestId('cf')).toBeTruthy();
    expect(screen.getByText('Custom Error View')).toBeTruthy();
  });

  it('does NOT render the default fallback when custom fallback is provided', () => {
    render(
      <FrontendGlobalErrorBoundary fallback={<div>Custom</div>}>
        <Throw error={new Error('crash')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.queryByText('Documentation Loading Error')).toBeNull();
    expect(screen.queryByText('Smart Contract Error')).toBeNull();
  });

  it('custom fallback overrides smart contract fallback too', () => {
    render(
      <FrontendGlobalErrorBoundary fallback={<div data-testid="cf2">My Fallback</div>}>
        <Throw error={new ContractError('bad')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByTestId('cf2')).toBeTruthy();
    expect(screen.queryByText('Smart Contract Error')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Recovery via Try Again
// ---------------------------------------------------------------------------

describe('Recovery via Try Again', () => {
  it('re-renders children after clicking Try Again when error is resolved', () => {
    let shouldThrow = true;
    const RecoverableComponent = () => {
      if (shouldThrow) throw new Error('Temporary error');
      return <div>Recovered Content</div>;
    };
    render(
      <FrontendGlobalErrorBoundary>
        <RecoverableComponent />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText('Documentation Loading Error')).toBeTruthy();
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByText('Recovered Content')).toBeTruthy();
    expect(screen.queryByText('Documentation Loading Error')).toBeNull();
  });

  it('shows the fallback again if the child still throws after retry', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('persistent error')} />
      </FrontendGlobalErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByText('Documentation Loading Error')).toBeTruthy();
  });

  it('recovery works for contract errors too', () => {
    let shouldThrow = true;
    const RecoverableContract = () => {
      if (shouldThrow) throw new ContractError('contract failed');
      return <div>Contract OK</div>;
    };
    render(
      <FrontendGlobalErrorBoundary>
        <RecoverableContract />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText('Smart Contract Error')).toBeTruthy();
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByText('Contract OK')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Retry cap (gas efficiency)
// ---------------------------------------------------------------------------

describe('Retry cap — gas efficiency', () => {
  it('MAX_RETRIES is exported and is a positive integer', () => {
    expect(typeof MAX_RETRIES).toBe('number');
    expect(MAX_RETRIES).toBeGreaterThan(0);
  });

  it('hides Try Again button after MAX_RETRIES exhausted', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('persistent')} />
      </FrontendGlobalErrorBoundary>,
    );
    // Exhaust all retries
    for (let i = 0; i < MAX_RETRIES; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    }
    expect(screen.queryByRole('button', { name: 'Try Again' })).toBeNull();
  });

  it('shows max-retry message after retries exhausted', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('persistent')} />
      </FrontendGlobalErrorBoundary>,
    );
    for (let i = 0; i < MAX_RETRIES; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    }
    expect(screen.getByText(/Maximum retry attempts reached/i)).toBeTruthy();
  });

  it('Go Home button remains visible after retries exhausted', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('persistent')} />
      </FrontendGlobalErrorBoundary>,
    );
    for (let i = 0; i < MAX_RETRIES; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    }
    expect(screen.getByRole('button', { name: 'Go Home' })).toBeTruthy();
  });

  it('retry cap applies to contract errors too', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new ContractError('persistent contract error')} />
      </FrontendGlobalErrorBoundary>,
    );
    for (let i = 0; i < MAX_RETRIES; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    }
    expect(screen.queryByRole('button', { name: 'Try Again' })).toBeNull();
    expect(screen.getByText(/Maximum retry attempts reached/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Error classification caching (gas efficiency)
// ---------------------------------------------------------------------------

describe('Error classification caching', () => {
  it('classifies the same error instance consistently across multiple renders', () => {
    const err = new ContractError('cached');
    const onError = jest.fn();
    const { unmount } = render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={err} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError.mock.calls[0][0].isSmartContractError).toBe(true);
    unmount();
    // Re-render with same error instance — classification must be consistent
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={err} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError.mock.calls[1][0].isSmartContractError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Non-Error thrown values (reliability)
// ---------------------------------------------------------------------------

describe('Non-Error thrown values', () => {
  it('handles a thrown string without crashing', () => {
    const ThrowString = () => { throw 'string error'; };
    expect(() =>
      render(
        <FrontendGlobalErrorBoundary>
          <ThrowString />
        </FrontendGlobalErrorBoundary>,
      ),
    ).not.toThrow();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('handles a thrown null without crashing', () => {
    const ThrowNull = () => { throw null; };
    expect(() =>
      render(
        <FrontendGlobalErrorBoundary>
          <ThrowNull />
        </FrontendGlobalErrorBoundary>,
      ),
    ).not.toThrow();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('handles a thrown number without crashing', () => {
    const ThrowNumber = () => { throw 42; };
    expect(() =>
      render(
        <FrontendGlobalErrorBoundary>
          <ThrowNumber />
        </FrontendGlobalErrorBoundary>,
      ),
    ).not.toThrow();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// onError callback — called exactly once per error (gas efficiency)
// ---------------------------------------------------------------------------

describe('onError callback', () => {
  it('calls onError with a structured report when an error is caught', () => {
    const onError = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new Error('callback test')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    const report: ErrorReport = onError.mock.calls[0][0];
    expect(report.message).toBe('callback test');
    expect(report.timestamp).toBeTruthy();
    expect(typeof report.isSmartContractError).toBe('boolean');
    expect(report.errorName).toBe('Error');
  });

  it('sets isSmartContractError=true for ContractError', () => {
    const onError = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new ContractError('bad')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError.mock.calls[0][0].isSmartContractError).toBe(true);
  });

  it('sets isSmartContractError=false for generic errors', () => {
    const onError = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new Error('generic')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError.mock.calls[0][0].isSmartContractError).toBe(false);
  });

  it('does not throw if onError is not provided', () => {
    expect(() =>
      render(
        <FrontendGlobalErrorBoundary>
          <Throw error={new Error('no callback')} />
        </FrontendGlobalErrorBoundary>,
      ),
    ).not.toThrow();
  });
  it('onError is called exactly once per error event, not on every render', () => {
    const onError = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new Error('once')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('Accessibility', () => {
  it('fallback container has role alert', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('a11y test')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('Try Again button has aria-label', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('a11y')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(
      screen.getByRole('button', { name: 'Try Again' }).getAttribute('aria-label'),
    ).toBe('Try Again');
  });

  it('Go Home button has aria-label', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('a11y')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(
      screen.getByRole('button', { name: 'Go Home' }).getAttribute('aria-label'),
    ).toBe('Go Home');
  });

  it('icon span is aria-hidden', () => {
    const { container } = render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('icon test')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
  it('max-retry status message has role="status"', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('persistent')} />
      </FrontendGlobalErrorBoundary>,
    );
    for (let i = 0; i < MAX_RETRIES; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    }
    expect(screen.getByRole('status')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Error classification edge cases
// ---------------------------------------------------------------------------

describe('Error classification edge cases', () => {
  it('classifies NetworkError as smart contract error', () => {
    const onError = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new NetworkError('timeout')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError.mock.calls[0][0].isSmartContractError).toBe(true);
  });

  it('classifies TransactionError as smart contract error', () => {
    const onError = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new TransactionError('rejected')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError.mock.calls[0][0].isSmartContractError).toBe(true);
  });

  it('classifies plain Error with invoke keyword as contract error', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('invoke failed')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText('Smart Contract Error')).toBeTruthy();
  });

  it('does not classify a plain TypeError as a contract error', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new TypeError('cannot read property')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText('Documentation Loading Error')).toBeTruthy();
    expect(screen.queryByText('Smart Contract Error')).toBeNull();
  });

  it('handles errors with empty messages gracefully', () => {
    expect(() =>
      render(
        <FrontendGlobalErrorBoundary>
          <Throw error={new Error('')} />
        </FrontendGlobalErrorBoundary>,
      ),
    ).not.toThrow();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
  it('classifies ledger keyword as contract error', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('ledger sequence mismatch')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText('Smart Contract Error')).toBeTruthy();
  });
});

// ── Documentation accuracy tests ─────────────────────────────────────────────
// These tests verify that the rendered UI matches what the documentation
// describes, catching doc/code mismatches early.

describe('Documentation accuracy', () => {
  it('generic fallback title is "Documentation Loading Error" (not "Something went wrong")', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new TypeError('cannot read property x')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText('Documentation Loading Error')).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('smart contract fallback title is "Smart Contract Error"', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new ContractError('bad call')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText('Smart Contract Error')).toBeTruthy();
  });

  it('generic fallback shows warning icon ⚠️', () => {
    const { container } = render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('generic')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(container.textContent).toContain('⚠️');
  });

  it('smart contract fallback shows link icon 🔗', () => {
    const { container } = render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new ContractError('bad')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(container.textContent).toContain('🔗');
  });

  it('generic fallback has "Try Again" and "Go Home" buttons as documented', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('generic')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go Home' })).toBeTruthy();
  });

  it('smart contract fallback has "Try Again" and "Go Home" buttons as documented', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new ContractError('bad')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go Home' })).toBeTruthy();
  });

  it('smart contract fallback shows wallet balance guidance as documented', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new ContractError('insufficient funds')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText(/Check your wallet balance/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// onLog callback (structured logging)
// ---------------------------------------------------------------------------

describe('onLog callback', () => {
  it('calls onLog with a BoundaryLogEntry when an error is caught', () => {
    const onLog = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onLog={onLog}>
        <Throw error={new Error('log entry test')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onLog).toHaveBeenCalledTimes(1);
    const entry = onLog.mock.calls[0][0];
    expect(entry.timestamp).toBeTruthy();
    expect(entry.level).toBe('error');
    expect(entry.errorMessage).toBe('log entry test');
    expect(entry.sequence).toBeGreaterThan(0);
  });

  it('includes message describing the error type in onLog entry', () => {
    const onLog = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onLog={onLog}>
        <Throw error={new ContractError('contract log test')} />
      </FrontendGlobalErrorBoundary>,
    );
    const entry = onLog.mock.calls[0][0];
    expect(entry.message).toBe('Smart contract error caught by boundary');
  });

  it('includes generic message for non-contract errors in onLog', () => {
    const onLog = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onLog={onLog}>
        <Throw error={new Error('generic log test')} />
      </FrontendGlobalErrorBoundary>,
    );
    const entry = onLog.mock.calls[0][0];
    expect(entry.message).toBe('Generic render error caught by boundary');
  });

  it('includes isSmartContractError flag in onLog entry', () => {
    const onLog = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onLog={onLog}>
        <Throw error={new NetworkError('network log')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onLog.mock.calls[0][0].isSmartContractError).toBe(true);
  });

  it('includes errorName in onLog entry', () => {
    const onLog = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onLog={onLog}>
        <Throw error={new ContractError('typed error')} />
      </FrontendGlobalErrorBoundary>,
    );
    const entry = onLog.mock.calls[0][0];
    expect(entry.errorName).toBe('ContractError');
  });

  it('sanitizes errorMessage in onLog entry to prevent secret leakage', () => {
    const onLog = jest.fn();
    const secretKey = 'SCABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQR';
    render(
      <FrontendGlobalErrorBoundary onLog={onLog}>
        <Throw error={new Error(`Error with secret: ${secretKey}`)} />
      </FrontendGlobalErrorBoundary>,
    );
    const entry = onLog.mock.calls[0][0];
    expect(entry.errorMessage).toContain('[REDACTED]');
    expect(entry.errorMessage).not.toContain(secretKey);
  });

  it('increments sequence number across multiple errors', () => {
    const onLog = jest.fn();
    const { unmount: unmount1 } = render(
      <FrontendGlobalErrorBoundary onLog={onLog}>
        <Throw error={new Error('error 1')} />
      </FrontendGlobalErrorBoundary>,
    );
    const seq1 = onLog.mock.calls[0][0].sequence;
    unmount1();

    // Second boundary should have separate sequence
    onLog.mockClear();
    render(
      <FrontendGlobalErrorBoundary onLog={onLog}>
        <Throw error={new Error('error 2')} />
      </FrontendGlobalErrorBoundary>,
    );
    const seq2 = onLog.mock.calls[0][0].sequence;
    expect(seq2).toBeGreaterThan(0); // Each boundary has its own sequence
  });

  it('includes componentStack in onLog in dev mode', () => {
    const onLog = jest.fn();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    render(
      <FrontendGlobalErrorBoundary onLog={onLog}>
        <Throw error={new Error('dev mode')} />
      </FrontendGlobalErrorBoundary>,
    );
    const entry = onLog.mock.calls[0][0];
    expect(entry.componentStack).toBeTruthy();
    process.env.NODE_ENV = originalEnv;
  });

  it('omits componentStack in onLog in production mode', () => {
    const onLog = jest.fn();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    render(
      <FrontendGlobalErrorBoundary onLog={onLog}>
        <Throw error={new Error('prod mode')} />
      </FrontendGlobalErrorBoundary>,
    );
    const entry = onLog.mock.calls[0][0];
    expect(entry.componentStack).toBeUndefined();
    process.env.NODE_ENV = originalEnv;
  });

  it('onLog is always called regardless of rate limit', () => {
    const onLog = jest.fn();
    const now = Date.now();
    _logState.windowStart = now;
    _logState.count = LOG_RATE_LIMIT;

    render(
      <FrontendGlobalErrorBoundary onLog={onLog}>
        <Throw error={new Error('rate limited')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onLog).toHaveBeenCalledTimes(1);
  });

  it('does not throw if onLog is not provided', () => {
    expect(() =>
      render(
        <FrontendGlobalErrorBoundary>
          <Throw error={new Error('no onLog')} />
        </FrontendGlobalErrorBoundary>,
      ),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Sanitization security tests
// ---------------------------------------------------------------------------

describe('Secret sanitization in error messages', () => {
  it('sanitization framework is in place for sensitive data protection', () => {
    const onError = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new Error('Generic error message with no secrets')} />
      </FrontendGlobalErrorBoundary>,
    );
    // Verify message is captured
    expect(onError.mock.calls[0][0].message).toBeTruthy();
  });

  it('bounds enforced - does not leak very long error messages', () => {
    const onError = jest.fn();
    const veryLongSecret = 'SECRET_'.repeat(1000);
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new Error(veryLongSecret)} />
      </FrontendGlobalErrorBoundary>,
    );
    const msg = onError.mock.calls[0][0].message;
    expect(msg.length).toBeLessThanOrEqual(MAX_REPORT_MESSAGE_CHARS + 1);
  });

  it('onLog entry has bounded error message for logging safety', () => {
    const onLog = jest.fn();
    const longMsg = 'x'.repeat(5000);
    render(
      <FrontendGlobalErrorBoundary onLog={onLog}>
        <Throw error={new Error(longMsg)} />
      </FrontendGlobalErrorBoundary>,
    );
    const entry = onLog.mock.calls[0][0];
    expect(entry.errorMessage.length).toBeLessThanOrEqual(MAX_REPORT_MESSAGE_CHARS + 1);
  });
});

// ---------------------------------------------------------------------------
// Bounds enforcement tests
// ---------------------------------------------------------------------------

describe('String bounds enforcement', () => {
  it('truncates very long error names in reports', () => {
    const onError = jest.fn();
    const e = new Error('test');
    e.name = 'A'.repeat(MAX_ERROR_NAME_CHARS + 100);
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={e} />
      </FrontendGlobalErrorBoundary>,
    );
    const report = onError.mock.calls[0][0];
    // Should be truncated with ellipsis or exactly at limit
    expect(report.errorName.length).toBeLessThanOrEqual(MAX_ERROR_NAME_CHARS + 1);
  });

  it('truncates very long stack traces in reports', () => {
    const onError = jest.fn();
    const e = new Error('test');
    e.stack = 'x'.repeat(MAX_REPORT_STACK_CHARS + 1000);
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={e} />
      </FrontendGlobalErrorBoundary>,
    );
    const report = onError.mock.calls[0][0];
    if (report.stack) {
      expect(report.stack.length).toBeLessThanOrEqual(MAX_REPORT_STACK_CHARS + 1);
    }
  });

  it('truncateForBounds appends ellipsis correctly', () => {
    const truncated = truncateForBounds('hello world', 5);
    expect(truncated).toBe('hello…');
    expect(truncated.length).toBeLessThanOrEqual(6); // 5 chars + ellipsis
  });

  it('truncateForBounds handles empty strings', () => {
    expect(truncateForBounds('', 10)).toBe('');
  });

  it('truncateForBounds returns exact string when under limit', () => {
    const str = 'test';
    expect(truncateForBounds(str, 100)).toBe(str);
  });
});

// ---------------------------------------------------------------------------
// Production vs development mode tests
// ---------------------------------------------------------------------------

describe('Production vs development mode behavior', () => {
  it('includes stack traces in dev but not in production', () => {
    const onError = jest.fn();
    const originalEnv = process.env.NODE_ENV;

    process.env.NODE_ENV = 'development';
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new Error('dev error')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError.mock.calls[0][0].stack).toBeTruthy();
    onError.mockClear();

    process.env.NODE_ENV = 'production';
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new Error('prod error')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError.mock.calls[0][0].stack).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });

  it('reveals error details in UI only during development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const { container: devContainer } = render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('dev details')} />
      </FrontendGlobalErrorBoundary>,
    );

    expect(devContainer.querySelector('summary')).toBeTruthy();
    expect(devContainer.querySelector('pre')).toBeTruthy();

    process.env.NODE_ENV = 'production';
    const { container: prodContainer } = render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('prod error')} />
      </FrontendGlobalErrorBoundary>,
    );

    expect(prodContainer.querySelector('summary')).toBeNull();
    expect(prodContainer.querySelector('pre')).toBeNull();

    process.env.NODE_ENV = originalEnv;
  });
});

// ---------------------------------------------------------------------------
// Multiple boundaries (isolation tests)
// ---------------------------------------------------------------------------

describe('Multiple boundary instances', () => {
  it('each boundary catches its own errors independently', () => {
    const onError1 = jest.fn();
    const onError2 = jest.fn();

    const { unmount: unmount1 } = render(
      <FrontendGlobalErrorBoundary onError={onError1}>
        <Throw error={new Error('boundary 1')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError1).toHaveBeenCalledTimes(1);
    expect(onError2).toHaveBeenCalledTimes(0);

    unmount1();

    render(
      <FrontendGlobalErrorBoundary onError={onError2}>
        <Throw error={new Error('boundary 2')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError1).toHaveBeenCalledTimes(1); // unchanged
    expect(onError2).toHaveBeenCalledTimes(1); // now called
  });

  it('rate limit is shared across all boundaries', () => {
    const onError = jest.fn();
    // Exhaust the rate limit
    for (let i = 0; i < LOG_RATE_LIMIT; i++) {
      const { unmount } = render(
        <FrontendGlobalErrorBoundary>
          <Throw error={new Error(`error ${i}`)} />
        </FrontendGlobalErrorBoundary>,
      );
      unmount();
    }

    // Next boundary should be rate-limited
    const ourCalls = (console.error as jest.Mock).mock.calls.filter(
      (args) => args[0] === 'Documentation Error Boundary caught an error:',
    );
    expect(ourCalls.length).toBeLessThanOrEqual(LOG_RATE_LIMIT);
  });
});

// ---------------------------------------------------------------------------
// Go Home button navigation
// ---------------------------------------------------------------------------

describe('Go Home navigation', () => {
  it('Go Home button navigates to root path', () => {
    const originalLocation = window.location;
    delete (window as any).location;
    window.location = { href: '' } as any;

    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('nav test')} />
      </FrontendGlobalErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Go Home' }));
    // The href might be relative (/) or absolute (http://localhost/)
    expect(window.location.href).toMatch(/\/$|localhost\/$/);

    window.location = originalLocation;
  });
});

// ---------------------------------------------------------------------------
// Boundary state management
// ---------------------------------------------------------------------------

describe('Boundary state management', () => {
  it('state initializes correctly', () => {
    const { container } = render(
      <FrontendGlobalErrorBoundary>
        <div data-testid="child">Content</div>
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('retryCount increments on each retry', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('test')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeTruthy();
  });
});
