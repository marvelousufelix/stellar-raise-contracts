import React, { useEffect, useRef, useState } from "react";

/**
 * @title MilestoneCountdown
 * @notice Displays a live countdown to a campaign deadline alongside milestone
 *         celebration overlays. When the deadline is reached, a "Campaign Ended"
 *         state is shown. When a milestone threshold is crossed, a dismissible
 *         celebration banner fires.
 *
 * @dev Security assumptions:
 *   - All user-supplied strings are rendered as React text nodes only.
 *     No dangerouslySetInnerHTML is used anywhere in this module.
 *   - Deadline is validated as a positive integer (Unix seconds); invalid values
 *     cause the component to render nothing.
 *   - Interval timers are cleared on unmount to prevent memory leaks.
 *   - `onMilestoneDismiss` carries no data back to the caller.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Basis-point scale (10 000 bps = 100 %). */
export const BPS_SCALE = 10_000;

/** Maximum length for milestone title strings. */
export const MAX_TITLE_LENGTH = 60;

/** Maximum length for milestone message strings. */
export const MAX_MESSAGE_LENGTH = 160;

/** Tick interval in milliseconds. */
export const TICK_MS = 1_000;

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * @notice Decomposed time remaining until the deadline.
 */
export interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * @notice A single funding milestone definition.
 * @param thresholdBps  Progress threshold in basis points (1–10 000).
 * @param title         Short celebration heading (max 60 chars).
 * @param message       Supporting copy shown below the heading (max 160 chars).
 */
export interface Milestone {
  thresholdBps: number;
  title: string;
  message: string;
}

/**
 * @notice Props for the MilestoneCountdown component.
 * @param deadlineUnix    Campaign deadline as a Unix timestamp (seconds).
 * @param progressBps     Current campaign progress in basis points (0–10 000).
 * @param milestones      Ordered list of milestones to check against.
 * @param nowFn           Optional clock override for testing (returns ms).
 * @param onMilestoneDismiss  Called when the user dismisses a celebration.
 */
export interface MilestoneCountdownProps {
  deadlineUnix: number;
  progressBps: number;
  milestones?: Milestone[];
  nowFn?: () => number;
  onMilestoneDismiss?: () => void;
}

// ── Pure helpers (exported for unit testing) ──────────────────────────────────

/**
 * @title sanitizeText
 * @notice Strips control characters, normalises whitespace, and truncates.
 * @param value   Untrusted input.
 * @param maxLen  Hard character limit.
 * @returns       Safe string, or empty string when input is unusable.
 * @security Prevents layout abuse from oversized or malformed strings.
 */
export function sanitizeText(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, maxLen);
}

/**
 * @title isValidDeadline
 * @notice Returns true when `deadlineUnix` is a finite positive integer.
 * @security Rejects NaN, Infinity, negative values, and non-numbers.
 */
export function isValidDeadline(deadlineUnix: unknown): boolean {
  return (
    typeof deadlineUnix === "number" &&
    Number.isFinite(deadlineUnix) &&
    Number.isInteger(deadlineUnix) &&
    deadlineUnix > 0
  );
}

/**
 * @title computeTimeLeft
 * @notice Calculates days/hours/minutes/seconds remaining until `deadlineUnix`.
 * @param deadlineUnix  Target Unix timestamp in seconds.
 * @param nowMs         Current time in milliseconds.
 * @returns             TimeLeft with all fields ≥ 0, or null when deadline has passed.
 */
export function computeTimeLeft(
  deadlineUnix: number,
  nowMs: number,
): TimeLeft | null {
  const diffMs = deadlineUnix * 1_000 - nowMs;
  if (diffMs <= 0) return null;
  const totalSeconds = Math.floor(diffMs / 1_000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

/**
 * @title isValidMilestone
 * @notice Returns true when a milestone has a valid threshold and non-empty strings.
 * @security Rejects milestones with out-of-range thresholds or empty labels.
 */
export function isValidMilestone(m: unknown): m is Milestone {
  if (!m || typeof m !== "object") return false;
  const { thresholdBps, title, message } = m as Record<string, unknown>;
  return (
    typeof thresholdBps === "number" &&
    Number.isInteger(thresholdBps) &&
    thresholdBps >= 1 &&
    thresholdBps <= BPS_SCALE &&
    typeof title === "string" &&
    title.trim().length > 0 &&
    typeof message === "string" &&
    message.trim().length > 0
  );
}

/**
 * @title resolveTriggeredMilestone
 * @notice Returns the highest valid milestone whose threshold ≤ progressBps,
 *         or null when none qualifies.
 * @param progressBps  Current progress in basis points.
 * @param milestones   Candidate milestones (may contain invalid entries).
 */
export function resolveTriggeredMilestone(
  progressBps: number,
  milestones: Milestone[],
): Milestone | null {
  const valid = milestones.filter(isValidMilestone);
  const triggered = valid.filter((m) => m.thresholdBps <= progressBps);
  if (triggered.length === 0) return null;
  return triggered.reduce((best, m) =>
    m.thresholdBps > best.thresholdBps ? m : best,
  );
}

/**
 * @title padTwo
 * @notice Zero-pads a number to at least two digits.
 */
export function padTwo(n: number): string {
  return String(n).padStart(2, "0");
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * @title MilestoneCountdown
 * @notice Live countdown timer with milestone celebration overlay.
 */
const MilestoneCountdown: React.FC<MilestoneCountdownProps> = ({
  deadlineUnix,
  progressBps,
  milestones = [],
  nowFn = () => Date.now(),
  onMilestoneDismiss,
}) => {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(() =>
    isValidDeadline(deadlineUnix)
      ? computeTimeLeft(deadlineUnix, nowFn())
      : null,
  );
  const [dismissed, setDismissed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick every second
  useEffect(() => {
    if (!isValidDeadline(deadlineUnix)) return;
    intervalRef.current = setInterval(() => {
      setTimeLeft(computeTimeLeft(deadlineUnix, nowFn()));
    }, TICK_MS);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [deadlineUnix, nowFn]);

  // Reset dismiss state when progress changes (new milestone may fire)
  useEffect(() => {
    setDismissed(false);
  }, [progressBps]);

  if (!isValidDeadline(deadlineUnix)) return null;

  const triggered = resolveTriggeredMilestone(progressBps, milestones);
  const showCelebration = triggered !== null && !dismissed;

  const handleDismiss = () => {
    setDismissed(true);
    onMilestoneDismiss?.();
  };

  return (
    <div
      className="milestone-countdown"
      role="region"
      aria-label="Campaign countdown"
    >
      {/* ── Countdown display ── */}
      {timeLeft === null ? (
        <p
          className="milestone-countdown__ended"
          role="status"
          aria-live="polite"
        >
          Campaign Ended
        </p>
      ) : (
        <div
          className="milestone-countdown__timer"
          role="timer"
          aria-label={`${timeLeft.days} days ${timeLeft.hours} hours ${timeLeft.minutes} minutes ${timeLeft.seconds} seconds remaining`}
          aria-live="off"
        >
          <span className="milestone-countdown__unit" data-testid="days">
            <span className="milestone-countdown__value">{padTwo(timeLeft.days)}</span>
            <span className="milestone-countdown__label">d</span>
          </span>
          <span className="milestone-countdown__unit" data-testid="hours">
            <span className="milestone-countdown__value">{padTwo(timeLeft.hours)}</span>
            <span className="milestone-countdown__label">h</span>
          </span>
          <span className="milestone-countdown__unit" data-testid="minutes">
            <span className="milestone-countdown__value">{padTwo(timeLeft.minutes)}</span>
            <span className="milestone-countdown__label">m</span>
          </span>
          <span className="milestone-countdown__unit" data-testid="seconds">
            <span className="milestone-countdown__value">{padTwo(timeLeft.seconds)}</span>
            <span className="milestone-countdown__label">s</span>
          </span>
        </div>
      )}

      {/* ── Milestone celebration overlay ── */}
      {showCelebration && triggered && (
        <div
          className="milestone-countdown__celebration"
          role="alert"
          aria-live="assertive"
          data-testid="celebration-banner"
        >
          <p className="milestone-countdown__celebration-title">
            {sanitizeText(triggered.title, MAX_TITLE_LENGTH)}
          </p>
          <p className="milestone-countdown__celebration-message">
            {sanitizeText(triggered.message, MAX_MESSAGE_LENGTH)}
          </p>
          <button
            className="milestone-countdown__dismiss"
            onClick={handleDismiss}
            aria-label="Dismiss celebration"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default MilestoneCountdown;
