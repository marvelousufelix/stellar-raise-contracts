/**
 * @notice Optimized React Submit Button for script execution and Stellar tx.
 * @dev Refactored with custom hooks for state management, optimized dependencies, and improved security.
 * @custom:security No double-submit (inFlightRef), XSS-safe labels/output/txHash, isMounted guard.
 * @custom:refactor Extracted state logic into useSubmitButtonState hook; optimized memoization; improved error handling.
 */

import React, {
  useReducer,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type MouseEvent,
} from "react";

/** Button states optimized for script/tx flow. */
export type SubmitButtonState =
  | "idle"
  | "pending"
  | "success"
  | "error"
  | "disabled";

/** Per-state label overrides (sanitized on use). */
export interface SubmitButtonLabels {
  idle?: string;
  pending?: string;
  success?: string;
  error?: string;
  disabled?: string;
}

/** Props for script/tx integration. */
export interface ReactSubmitButtonProps {
  /** Current state (required). */
  state: SubmitButtonState;
  /** Previous state for transition validation. */
  previousState?: SubmitButtonState;
  /** Enforce strict transitions (default true). */
  strictTransitions?: boolean;
  /** Custom labels per state. */
  labels?: SubmitButtonLabels;
  /** Script output / tx result (truncated, sanitized). */
  scriptOutput?: unknown;
  /** Truncated tx hash for display. */
  txHash?: string;
  /** Click handler. */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  /** Error handler for failed operations. */
  onError?: (error: Error) => void;
  /** CSS class. */
  className?: string;
  /** Element ID. */
  id?: string;
  /** Button type (default 'button'). */
  type?: "button" | "submit" | "reset";
  /** External disabled. */
  disabled?: boolean;
}

// ── Reducer ──
type LocalAction = { type: "START_PENDING" } | { type: "END_PENDING" };
interface LocalState {
  isPending: boolean;
}

export function submitButtonReducer(
  state: LocalState,
  action: LocalAction
): LocalState {
  switch (action.type) {
    case "START_PENDING":
      return { isPending: true };
    case "END_PENDING":
      return { isPending: false };
    default:
      return state;
  }
}

// ── Constants ──
export const MAX_LABEL_LENGTH = 80;
export const MAX_HASH_DISPLAY = 12;
export const MAX_SCRIPT_OUTPUT_LENGTH = 40;

export const DEFAULT_LABELS: Required<SubmitButtonLabels> = {
  idle: "Execute Script",
  pending: "Running...",
  success: "Success",
  error: "Retry",
  disabled: "Disabled",
};

export const ALLOWED_TRANSITIONS: Record<
  SubmitButtonState,
  SubmitButtonState[]
> = {
  idle: ["pending", "disabled"],
  pending: ["success", "error", "disabled"],
  success: ["idle", "disabled"],
  error: ["idle", "pending", "disabled"],
  disabled: ["idle"],
};

const BASE_STYLE: React.CSSProperties = {
  minHeight: "44px",
  minWidth: "140px",
  borderRadius: "8px",
  border: "1px solid #4f46e5",
  padding: "0.5rem 1rem",
  color: "#ffffff",
  fontWeight: 600,
  cursor: "pointer",
  transition: "all 0.2s ease",
  backgroundColor: "#4f46e5",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
};

const STATE_STYLES: Record<SubmitButtonState, React.CSSProperties> = {
  idle: { backgroundColor: "#4f46e5" },
  pending: { backgroundColor: "#6366f1" },
  success: { backgroundColor: "#16a34a", borderColor: "#15803d" },
  error: { backgroundColor: "#dc2626", borderColor: "#b91c1c" },
  disabled: {
    backgroundColor: "#9ca3af",
    borderColor: "#9ca3af",
    cursor: "not-allowed",
    opacity: 0.7,
  },
};

// ── Pure Helpers (tested independently) ──

/** Sanitizes label/script output. */
export function normalizeText(
  candidate: unknown,
  fallback: string,
  maxLen = MAX_LABEL_LENGTH
): string {
  if (typeof candidate !== "string") return fallback;
  const cleaned = candidate
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback;
  return cleaned.length <= maxLen
    ? cleaned
    : `${cleaned.slice(0, maxLen - 3)}...`;
}

/** Resolves safe label. */
export function resolveLabel(
  state: SubmitButtonState,
  labels?: SubmitButtonLabels
): string {
  return normalizeText(labels?.[state], DEFAULT_LABELS[state]);
}

/** Validates state transition. */
export function isValidTransition(
  from: SubmitButtonState,
  to: SubmitButtonState
): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}

/** Strict state resolver with validation. */
export function resolveSafeState(
  state: SubmitButtonState,
  prev?: SubmitButtonState,
  strict = true
): SubmitButtonState {
  if (!strict || !prev || isValidTransition(prev, state)) return state;
  return prev;
}

/** Blocks interaction? */
export function isInteractionBlocked(
  state: SubmitButtonState,
  disabled = false,
  localPending = false
): boolean {
  return (
    Boolean(disabled) ||
    ["pending", "success", "disabled"].includes(state) ||
    localPending
  );
}

/** Is state busy? */
export function isBusy(
  state: SubmitButtonState,
  localPending = false
): boolean {
  return state === "pending" || localPending;
}

/** Checks if transition is allowed for strict mode. */
export function validateStateTransition(
  current: SubmitButtonState,
  next: SubmitButtonState,
  previous?: SubmitButtonState,
  strictMode = true
): { valid: boolean; resolvedState: SubmitButtonState } {
  if (!strictMode || !previous) {
    return { valid: true, resolvedState: next };
  }
  const valid = isValidTransition(previous, next);
  return { valid, resolvedState: valid ? next : previous };
}

// ── Custom Hooks ──

/**
 * @dev Manages internal pending state for async operations.
 * Provides a reducer-based interface for controlling the button's local pending state.
 *
 * @returns An object containing the pending state and dispatch function.
 */
export function useLocalPendingState() {
  const [{ isPending }, dispatch] = useReducer(submitButtonReducer, {
    isPending: false,
  });

  const startPending = useCallback(() => {
    dispatch({ type: "START_PENDING" });
  }, []);

  const endPending = useCallback(() => {
    dispatch({ type: "END_PENDING" });
  }, []);

  return { isPending, startPending, endPending };
}

/**
 * @dev Custom hook for managing submit button state and transitions.
 * Combines external state, previous state, and strict mode validation.
 *
 * @param state The external button state
 * @param previousState Optional previous state for validation
 * @param strictTransitions Whether to validate transitions strictly
 * @returns The resolved safe state
 */
export function useSubmitButtonState(
  state: SubmitButtonState,
  previousState?: SubmitButtonState,
  strictTransitions = true
): SubmitButtonState {
  return useMemo(
    () => resolveSafeState(state, previousState, strictTransitions),
    [state, previousState, strictTransitions]
  );
}

/**
 * @dev Custom hook for resolving button label with memoization.
 * Combines state and custom labels to produce the final button text.
 *
 * @param state The button state
 * @param labels Optional custom labels per state
 * @returns The resolved, sanitized label for display
 */
export function useSubmitButtonLabel(
  state: SubmitButtonState,
  labels?: SubmitButtonLabels
): string {
  return useMemo(() => resolveLabel(state, labels), [state, labels]);
}

/**
 * @dev Custom hook for computing subtext from txHash or scriptOutput.
 * Sanitizes and truncates output appropriately.
 *
 * @param txHash Optional transaction hash
 * @param scriptOutput Optional script output
 * @returns Formatted subtext for display
 */
export function useSubmitButtonSubtext(
  txHash?: string,
  scriptOutput?: unknown
): string {
  return useMemo(() => {
    let text = "";
    if (txHash) text = `Tx: …${txHash.slice(-MAX_HASH_DISPLAY)}`;
    else if (scriptOutput)
      text = normalizeText(scriptOutput, "Script output", MAX_SCRIPT_OUTPUT_LENGTH);
    return text ? `(${text})` : "";
  }, [txHash, scriptOutput]);
}

/**
 * @dev Custom hook for computing interaction state.
 * Determines if the button can be interacted with.
 *
 * @param state The button state
 * @param disabled External disabled prop
 * @param localPending Internal pending state
 * @returns Boolean indicating if interaction is blocked
 */
export function useSubmitButtonInteractionState(
  state: SubmitButtonState,
  disabled?: boolean,
  localPending = false
): boolean {
  return useMemo(
    () => isInteractionBlocked(state, disabled, localPending),
    [state, disabled, localPending]
  );
}

/**
 * @dev Custom hook for computing button styles.
 * Merges base styles with state-specific styles.
 *
 * @param state The button state
 * @returns Computed styles for the button
 */
export function useSubmitButtonStyles(
  state: SubmitButtonState
): React.CSSProperties {
  return useMemo(
    () => ({ ...BASE_STYLE, ...STATE_STYLES[state] }),
    [state]
  );
}

// ── Component ──
const ReactSubmitButton: React.FC<ReactSubmitButtonProps> = ({
  state,
  previousState,
  strictTransitions = true,
  labels,
  scriptOutput,
  txHash,
  onClick,
  onError,
  className = "",
  id,
  type = "button",
  disabled,
}) => {
  const { isPending: localPending, startPending, endPending } = useLocalPendingState();
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resolvedState = useSubmitButtonState(state, previousState, strictTransitions);
  const label = useSubmitButtonLabel(resolvedState, labels);
  const subtext = useSubmitButtonSubtext(txHash, scriptOutput);
  const blocked = useSubmitButtonInteractionState(resolvedState, disabled, localPending);
  const ariaBusy = isBusy(resolvedState, localPending);
  const style = useSubmitButtonStyles(resolvedState);

  const handleClick = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      if (inFlightRef.current || blocked || !onClick) return;
      
      inFlightRef.current = true;
      startPending();
      
      try {
        await Promise.resolve(onClick(e));
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        if (onError) {
          onError(err);
        }
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) {
          endPending();
        }
      }
    },
    [blocked, onClick, onError, startPending, endPending]
  );

  return (
    <button
      id={id}
      type={type}
      className={`submit-btn ${className}`.trim()}
      disabled={blocked}
      aria-label={`${label}${subtext ? ` ${subtext}` : ""}`}
      aria-live="polite"
      aria-busy={ariaBusy}
      onClick={!blocked ? handleClick : undefined}
      style={style}
      data-state={resolvedState}
      title={subtext || label}
    >
      {resolvedState === "pending" && (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden="true"
          style={{ animation: "spin 1s linear infinite" }}
        >
          <circle
            cx="8"
            cy="8"
            r="7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="28 28"
            strokeLinecap="round"
          />
        </svg>
      )}
      <span>{label}</span>
      {subtext && (
        <small style={{ fontSize: "0.8em", opacity: 0.8 }}>{subtext}</small>
      )}
    </button>
  );
};

export default ReactSubmitButton;
