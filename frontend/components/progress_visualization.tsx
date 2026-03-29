import React, { useMemo } from "react";

/**
 * @title ProgressVisualization
 * @notice Renders a visual progress bar with milestone markers, percentage display,
 *         and funding status. Supports multiple visualization styles and responsive design.
 *
 * @dev Security assumptions:
 *   - No dangerouslySetInnerHTML — all content rendered as React text nodes.
 *   - Progress values are clamped to [0, 100] to prevent layout abuse.
 *   - All numeric values are validated and sanitized.
 *   - Currency formatting is applied safely without user-controlled HTML.
 *
 * @custom:accessibility
 *   - role="progressbar" with aria-valuenow, aria-valuemin, aria-valuemax.
 *   - aria-label describes the progress purpose.
 *   - Milestone markers are announced via aria-describedby.\n *   - Color contrast meets WCAG AA standards.\n */

export interface ProgressVisualizationProps {
  /** Current funding amount */
  currentAmount: number;
  /** Target funding goal */
  goalAmount: number;
  /** Milestone thresholds as percentages */
  milestones?: number[];
  /** Display style: 'linear' | 'circular' | 'segmented' */
  displayStyle?: "linear" | "circular" | "segmented";
  /** Show percentage text */
  showPercentage?: boolean;
  /** Show amount text */
  showAmount?: boolean;
  /** Currency symbol */
  currencySymbol?: string;
  /** Custom label for accessibility */
  label?: string;
  /** Callback when progress changes */
  onProgressChange?: (percent: number) => void;
}

export interface MilestoneMarker {
  percent: number;
  reached: boolean;
  label: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_MILESTONES = [25, 50, 75, 100];
const PROGRESS_COLORS = {
  low: "#FF6B6B",
  medium: "#FFA07A",
  high: "#4ECDC4",
  complete: "#2ECC71",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Clamps a value between min and max.
 */
function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculates progress percentage.
 */
function calculateProgress(current: number, goal: number): number {
  if (goal <= 0) return 0;
  return clampValue((current / goal) * 100, 0, 100);
}

/**
 * Determines progress color based on percentage.
 */
function getProgressColor(percent: number): string {
  if (percent >= 100) return PROGRESS_COLORS.complete;
  if (percent >= 75) return PROGRESS_COLORS.high;
  if (percent >= 50) return PROGRESS_COLORS.medium;
  return PROGRESS_COLORS.low;
}

/**
 * Formats currency value.
 */
function formatCurrency(amount: number, symbol: string): string {
  return `${symbol}${Math.round(amount).toLocaleString()}`;
}

/**
 * Sanitizes milestone value.
 */
function sanitizeMilestone(value: number): number {
  return clampValue(Math.floor(value), 0, 100);
}

/**
 * Creates milestone markers.
 */
function createMilestoneMarkers(
  milestones: number[],
  currentPercent: number,
): MilestoneMarker[] {
  return milestones
    .map(sanitizeMilestone)
    .filter((m, i, arr) => arr.indexOf(m) === i) // Remove duplicates
    .sort((a, b) => a - b)
    .map((m) => ({
      percent: m,
      reached: currentPercent >= m,
      label: `${m}%`,
    }));
}

// ── Component ─────────────────────────────────────────────────────────────────

const ProgressVisualization: React.FC<ProgressVisualizationProps> = ({
  currentAmount,
  goalAmount,
  milestones = DEFAULT_MILESTONES,
  displayStyle = "linear",
  showPercentage = true,
  showAmount = true,
  currencySymbol = "$",
  label = "Campaign funding progress",
  onProgressChange,
}) => {
  const clampedCurrent = Math.max(0, currentAmount);
  const clampedGoal = Math.max(1, goalAmount);
  const percent = useMemo(
    () => calculateProgress(clampedCurrent, clampedGoal),
    [clampedCurrent, clampedGoal],
  );

  const milestoneMarkers = useMemo(
    () => createMilestoneMarkers(milestones, percent),
    [milestones, percent],
  );

  const progressColor = useMemo(() => getProgressColor(percent), [percent]);

  // Notify on progress change
  React.useEffect(() => {
    if (onProgressChange) {
      onProgressChange(percent);
    }
  }, [percent, onProgressChange]);

  const progressId = `progress-${Math.random().toString(36).substr(2, 9)}`;
  const milestonesId = `milestones-${Math.random().toString(36).substr(2, 9)}`;

  if (displayStyle === "linear") {
    return (
      <div className="progress-visualization-linear">
        <div
          className="progress-bar-container"
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
          aria-describedby={milestonesId}
        >
          <div
            className="progress-bar-fill"
            style={{
              width: `${percent}%`,
              backgroundColor: progressColor,
              transition: "width 0.3s ease-in-out",
            }}
          />
        </div>

        <div className="progress-info">
          {showPercentage && (
            <span className="progress-percentage">{Math.round(percent)}%</span>
          )}
          {showAmount && (
            <span className="progress-amount">
              {formatCurrency(clampedCurrent, currencySymbol)} /{" "}
              {formatCurrency(clampedGoal, currencySymbol)}
            </span>
          )}
        </div>

        <div className="progress-milestones" id={milestonesId}>
          {milestoneMarkers.map((marker) => (
            <div
              key={marker.percent}
              className={`milestone-marker ${marker.reached ? "reached" : ""}`}
              style={{
                left: `${marker.percent}%`,
              }}
              aria-label={`${marker.label} milestone ${marker.reached ? "reached" : "not reached"}`}
            >
              <div className="milestone-dot" />
              <span className="milestone-label">{marker.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (displayStyle === "circular") {
    const circumference = 2 * Math.PI * 45;
    const strokeDashoffset = circumference - (percent / 100) * circumference;

    return (
      <div className="progress-visualization-circular">
        <svg
          className="progress-circle"
          viewBox="0 0 100 100"
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
        >
          <circle
            cx="50"
            cy="50"
            r="45"
            className="progress-circle-bg"
            fill="none"
            stroke="#e0e0e0"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            className="progress-circle-fill"
            fill="none"
            stroke={progressColor}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{
              transition: "stroke-dashoffset 0.3s ease-in-out",
            }}
          />
          <text
            x="50"
            y="50"
            textAnchor="middle"
            dy="0.3em"
            className="progress-circle-text"
            fontSize="24"
            fontWeight="bold"
          >
            {Math.round(percent)}%
          </text>
        </svg>

        <div className="progress-info">
          {showAmount && (
            <span className="progress-amount">
              {formatCurrency(clampedCurrent, currencySymbol)} /{" "}
              {formatCurrency(clampedGoal, currencySymbol)}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (displayStyle === "segmented") {
    const segments = 10;
    const filledSegments = Math.ceil((percent / 100) * segments);

    return (
      <div className="progress-visualization-segmented">
        <div
          className="progress-segments"
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
        >
          {Array.from({ length: segments }).map((_, i) => (
            <div
              key={i}
              className={`progress-segment ${i < filledSegments ? "filled" : ""}`}
              style={{
                backgroundColor:
                  i < filledSegments ? progressColor : "#e0e0e0",
              }}
            />
          ))}
        </div>

        <div className="progress-info">
          {showPercentage && (
            <span className="progress-percentage">{Math.round(percent)}%</span>
          )}
          {showAmount && (
            <span className="progress-amount">
              {formatCurrency(clampedCurrent, currencySymbol)} /{" "}
              {formatCurrency(clampedGoal, currencySymbol)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default ProgressVisualization;
