/**
 * @notice Comprehensive tests for refactored ReactSubmitButton.
 * @dev Covers custom hooks, state transitions, error handling, and dependency optimization.
 * Target: ≥95% statement coverage
 * Run: cd frontend && npm test react_submit_button.test.tsx
 */

import React from 'react';
import { render, screen, fireEvent, act, waitFor, renderHook } from '@testing-library/react';
import ReactSubmitButton, {
  isValidTransition,
  resolveSafeState,
  resolveLabel,
  isInteractionBlocked,
  isBusy,
  normalizeText,
  submitButtonReducer,
  validateStateTransition,
  useLocalPendingState,
  useSubmitButtonState,
  useSubmitButtonLabel,
  useSubmitButtonSubtext,
  useSubmitButtonInteractionState,
  useSubmitButtonStyles,
  DEFAULT_LABELS,
  ALLOWED_TRANSITIONS,
  MAX_LABEL_LENGTH,
  MAX_HASH_DISPLAY,
  MAX_SCRIPT_OUTPUT_LENGTH,
  type SubmitButtonState,
  type ReactSubmitButtonProps
} from './react_submit_button';

const renderBtn = (props: Partial<ReactSubmitButtonProps> = {}) => {
  const { container } = render(<ReactSubmitButton state="idle" {...props} />);
  return container.querySelector('button')!;
};

const STATES: SubmitButtonState[] = ['idle', 'pending', 'success', 'error', 'disabled'];

// ── Reducer ──
describe('submitButtonReducer', () => {
  it('START_PENDING sets isPending true', () => {
    expect(submitButtonReducer({ isPending: false }, { type: 'START_PENDING' })).toEqual({ isPending: true });
  });
  it('END_PENDING sets isPending false', () => {
    expect(submitButtonReducer({ isPending: true }, { type: 'END_PENDING' })).toEqual({ isPending: false });
  });
});

// ── Helpers ──
describe('normalizeText', () => {
  it('sanitizes non-strings to fallback', () => {
    expect(normalizeText(null, 'Fallback')).toBe('Fallback');
    expect(normalizeText(123, 'Fallback')).toBe('Fallback');
  });
  it('strips control chars/whitespace', () => {
    expect(normalizeText('\u0000Test\n\t', 'Fallback')).toBe('Test');
  });
  it('truncates long text', () => {
    const long = 'A'.repeat(90);
    expect(normalizeText(long, 'Short')).toHaveLength(80);
  });
});

describe('resolveLabel', () => {
  it('defaults match DEFAULT_LABELS', () => {
    STATES.forEach(s => expect(resolveLabel(s)).toBe(DEFAULT_LABELS[s]));
  });
  it('uses custom sanitized labels', () => {
    expect(resolveLabel('success', { success: ' Funded! ' })).toBe('Funded!');
  });
});

describe('state transitions', () => {
  it('validates allowed transitions', () => {
    expect(isValidTransition('idle', 'pending')).toBe(true);
    expect(isValidTransition('pending', 'success')).toBe(true);
  });
  it('blocks invalid', () => {
    expect(isValidTransition('idle', 'success')).toBe(false);
  });
  it('resolves safe state strict', () => {
    expect(resolveSafeState('success', 'idle')).toBe('idle');
  });
});

// ── Component ──
describe('ReactSubmitButton', () => {
  it('renders button', () => {
    expect(renderBtn().tagName).toBe('BUTTON');
  });

  it('shows resolved label', () => {
    renderBtn();
    expect(screen.getByText('Execute Script')).toBeInTheDocument();
  });

  it('shows subtext for txHash', () => {
    renderBtn({ txHash: 'abc123def456789' });
    expect(screen.getByText('(Tx: …123def456789)')).toBeInTheDocument();
  });

  it('shows sanitized scriptOutput', () => {
    renderBtn({ scriptOutput: 'Deployed\nSuccess' });
    expect(screen.getByText('(Deployed Success)')).toBeInTheDocument();
  });

  it('shows spinner in pending', () => {
    const { container } = render(<ReactSubmitButton state="pending" />);
    const spinner = container.querySelector('svg');
    expect(spinner).toBeTruthy();
  });

  it('disabled/blocked in pending/success/disabled', () => {
    ['pending', 'success', 'disabled'].forEach(s => {
      expect(renderBtn({ state: s as SubmitButtonState }).disabled).toBe(true);
    });
  });

  it('click fires in idle/error', async () => {
    const onClick = jest.fn(Promise.resolve);
    const btn = renderBtn({ onClick });
    await act(() => fireEvent.click(btn));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('double-submit blocked', async () => {
    const slow = jest.fn(() => new Promise(r => setTimeout(r, 100)));
    const btn = renderBtn({ onClick: slow });
    fireEvent.click(btn);
    fireEvent.click(btn); // ignored
    await waitFor(() => expect(slow).toHaveBeenCalledTimes(1));
  });

  it('isMounted guard unmount async', async () => {
    const slow = jest.fn(() => new Promise(r => setTimeout(r, 10)));
    const { unmount } = render(<ReactSubmitButton state='idle' onClick={slow} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    unmount();
    await waitFor(() => expect(slow).toHaveBeenCalledTimes(1));
  });

  it('a11y: aria-busy pending', () => {
    const btn = renderBtn({ state: 'pending' });
    expect(btn.getAttribute('aria-busy')).toBe('true');
  });

  it('strict transitions fallback', () => {
    const btn = renderBtn({ state: 'success', previousState: 'idle' });
    expect(btn.dataset.state).toBe('idle');
  });

  it('calls onError when click handler throws', async () => {
    const onError = jest.fn();
    const onClick = jest.fn(() => Promise.reject(new Error('Click failed')));
    const btn = renderBtn({ onClick, onError });
    
    await act(() => fireEvent.click(btn));
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('handles non-Error thrown values in onError', async () => {
    const onError = jest.fn();
    const onClick = jest.fn(() => Promise.reject('String error'));
    const btn = renderBtn({ onClick, onError });
    
    await act(() => fireEvent.click(btn));
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    const error = onError.mock.calls[0][0];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('String error');
  });

  it('onError callback not required', async () => {
    const onClick = jest.fn(() => Promise.reject(new Error('Click failed')));
    const btn = renderBtn({ onClick }); // no onError
    
    await act(async () => fireEvent.click(btn));
    await waitFor(() => expect(onClick).toHaveBeenCalledTimes(1));
  });
});

// ── Custom Hooks ──
describe('useLocalPendingState', () => {
  it('initializes with isPending false', () => {
    const { result } = renderHook(() => useLocalPendingState());
    expect(result.current.isPending).toBe(false);
  });

  it('startPending sets isPending true', () => {
    const { result } = renderHook(() => useLocalPendingState());
    act(() => {
      result.current.startPending();
    });
    expect(result.current.isPending).toBe(true);
  });

  it('endPending sets isPending false', () => {
    const { result } = renderHook(() => useLocalPendingState());
    act(() => {
      result.current.startPending();
    });
    act(() => {
      result.current.endPending();
    });
    expect(result.current.isPending).toBe(false);
  });

  it('startPending and endPending are stable callbacks', () => {
    const { result, rerender } = renderHook(() => useLocalPendingState());
    const startPending1 = result.current.startPending;
    const endPending1 = result.current.endPending;
    
    rerender();
    
    expect(result.current.startPending).toBe(startPending1);
    expect(result.current.endPending).toBe(endPending1);
  });
});

describe('useSubmitButtonState', () => {
  it('returns state when strict mode disabled', () => {
    const { result } = renderHook(() =>
      useSubmitButtonState('success', 'idle', false)
    );
    expect(result.current).toBe('success');
  });

  it('validates transition in strict mode', () => {
    const { result } = renderHook(() =>
      useSubmitButtonState('pending', 'idle', true)
    );
    expect(result.current).toBe('pending');
  });

  it('falls back to previous state on invalid transition', () => {
    const { result } = renderHook(() =>
      useSubmitButtonState('success', 'idle', true)
    );
    expect(result.current).toBe('idle');
  });

  it('updates when state prop changes', () => {
    const { result, rerender } = renderHook(
      ({ state }) => useSubmitButtonState(state, 'idle', true),
      { initialProps: { state: 'idle' as SubmitButtonState } }
    );
    expect(result.current).toBe('idle');
    
    rerender({ state: 'pending' });
    expect(result.current).toBe('pending');
  });
});

describe('useSubmitButtonLabel', () => {
  it('returns default label when no custom labels', () => {
    const { result } = renderHook(() => useSubmitButtonLabel('idle'));
    expect(result.current).toBe(DEFAULT_LABELS.idle);
  });

  it('uses custom label when provided', () => {
    const { result } = renderHook(() =>
      useSubmitButtonLabel('success', { success: 'All Done!' })
    );
    expect(result.current).toBe('All Done!');
  });

  it('sanitizes custom labels', () => {
    const { result } = renderHook(() =>
      useSubmitButtonLabel('idle', { idle: '  Space Label  ' })
    );
    expect(result.current).toBe('Space Label');
  });

  it('memoizes result when inputs unchanged', () => {
    const { result, rerender } = renderHook(
      ({ state, labels }) => useSubmitButtonLabel(state, labels),
      { initialProps: { state: 'idle' as SubmitButtonState, labels: undefined } }
    );
    const label1 = result.current;
    
    rerender({ state: 'idle', labels: undefined });
    
    expect(result.current).toBe(label1);
  });
});

describe('useSubmitButtonSubtext', () => {
  it('returns empty string when no txHash or scriptOutput', () => {
    const { result } = renderHook(() => useSubmitButtonSubtext());
    expect(result.current).toBe('');
  });

  it('shows txHash when provided', () => {
    const { result } = renderHook(() =>
      useSubmitButtonSubtext('abc123def456789', undefined)
    );
    expect(result.current).toContain('Tx: …');
    expect(result.current).toContain('789');
  });

  it('prioritizes txHash over scriptOutput', () => {
    const { result } = renderHook(() =>
      useSubmitButtonSubtext('abc123', 'script output')
    );
    expect(result.current).toContain('Tx:');
    expect(result.current).not.toContain('script output');
  });

  it('sanitizes scriptOutput', () => {
    const { result } = renderHook(() =>
      useSubmitButtonSubtext(undefined, 'Success\nResult')
    );
    expect(result.current).toContain('Success Result');
  });

  it('truncates long scriptOutput', () => {
    const { result } = renderHook(() =>
      useSubmitButtonSubtext(undefined, 'x'.repeat(100))
    );
    expect(result.current.length).toBeLessThanOrEqual(MAX_SCRIPT_OUTPUT_LENGTH + 10);
  });
});

describe('useSubmitButtonInteractionState', () => {
  it('blocks when state is disabled', () => {
    const { result } = renderHook(() =>
      useSubmitButtonInteractionState('disabled', false, false)
    );
    expect(result.current).toBe(true);
  });

  it('blocks when externally disabled', () => {
    const { result } = renderHook(() =>
      useSubmitButtonInteractionState('idle', true, false)
    );
    expect(result.current).toBe(true);
  });

  it('blocks when locally pending', () => {
    const { result } = renderHook(() =>
      useSubmitButtonInteractionState('idle', false, true)
    );
    expect(result.current).toBe(true);
  });

  it('allows in idle state when not blocked', () => {
    const { result } = renderHook(() =>
      useSubmitButtonInteractionState('idle', false, false)
    );
    expect(result.current).toBe(false);
  });

  it('allows in error state when not blocked', () => {
    const { result } = renderHook(() =>
      useSubmitButtonInteractionState('error', false, false)
    );
    expect(result.current).toBe(false);
  });
});

describe('useSubmitButtonStyles', () => {
  it('merges base styles with state styles', () => {
    const { result } = renderHook(() => useSubmitButtonStyles('idle'));
    expect(result.current.backgroundColor).toBe('#4f46e5');
  });

  it('returns different styles for pending state', () => {
    const { result } = renderHook(() => useSubmitButtonStyles('pending'));
    expect(result.current.backgroundColor).toBe('#6366f1');
  });

  it('returns success styles correctly', () => {
    const { result } = renderHook(() => useSubmitButtonStyles('success'));
    expect(result.current.backgroundColor).toBe('#16a34a');
  });

  it('includes base style properties', () => {
    const { result } = renderHook(() => useSubmitButtonStyles('idle'));
    expect(result.current.minHeight).toBe('44px');
    expect(result.current.cursor).toBe('pointer');
  });

  it('memoizes result when state unchanged', () => {
    const { result, rerender } = renderHook(
      ({ state }) => useSubmitButtonStyles(state),
      { initialProps: { state: 'idle' as SubmitButtonState } }
    );
    const styles1 = result.current;
    
    rerender({ state: 'idle' });
    
    expect(result.current).toBe(styles1);
  });
});

// ── Utility Functions ──
describe('validateStateTransition', () => {
  it('allows valid transitions in strict mode', () => {
    const result = validateStateTransition('idle', 'pending', 'idle', true);
    expect(result.valid).toBe(true);
    expect(result.resolvedState).toBe('pending');
  });

  it('rejects invalid transitions in strict mode', () => {
    const result = validateStateTransition('idle', 'success', 'idle', true);
    expect(result.valid).toBe(false);
    expect(result.resolvedState).toBe('idle');
  });

  it('allows any transition when strict mode disabled', () => {
    const result = validateStateTransition('idle', 'success', 'idle', false);
    expect(result.valid).toBe(true);
    expect(result.resolvedState).toBe('success');
  });

  it('allows transition when no previous state', () => {
    const result = validateStateTransition('idle', 'success', undefined, true);
    expect(result.valid).toBe(true);
    expect(result.resolvedState).toBe('success');
  });
});

