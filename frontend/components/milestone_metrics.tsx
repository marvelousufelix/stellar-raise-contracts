import React, { useMemo } from "react";

/**
 * @title MilestoneMetrics
 * @notice Tracks and displays performance metrics for campaign milestone
 *         celebrations. Provides time-to-milestone, velocity, and engagement
 *         analytics for campaign operators.
 *
 * @dev Security assumptions:
 *   - No dangerouslySetInnerHTML — all content rendered as React text nodes.
 *   - All numeric inputs are validated and clamped before use.
 *   - Timestamps are validated as positive integers.
 *   - No user-supplied HTML or URLs are rendered.
 *
 * @custom:accessibility
 *   - role="region" with aria-label for the metrics section.
 *   - Metric values use aria-label for screen-reader context.
 *   - Live regions announce metric updates.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const METRIC_MILESTONES = [25, 50, 75, 100] as const;
export type MetricThreshold = (typeof METRIC_MILESTONES)[number];

export const MAX_LABEL_LENGTH = 80;
export const MAX_HISTORY_ENTRIES = 100;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MilestoneEvent {
  /** Milestone threshold reached (25 | 50 | 75 | 100). */
  threshold: MetricThreshold;
  /** Unix timestamp (ms) when the milestone was reached. */
  reachedAt: number;
  /** Total raised at the time of the milestone (in token base units). */
  totalRaised: number;
  /** Number of contributors at the time of the milestone. */
  contributorCount: number;
}

export interface MilestoneMetricsSummary {
  /** Total number of milestones reached. */
  milestonesReached: number;
  /** Average time between milestones in ms (0 if < 2 milestones). */
  avgTimeBetweenMs: number;
  /** Fastest milestone-to-milestone interval in ms (0 if < 2 milestones). */
  fastestIntervalMs: number;
  /** Total raised at the latest milestone. */
  latestTotalRaised: number;
  /** Velocity: average raised per milestone. */
  avgRaisedPerMilestone: number;
}

export interface MilestoneMetricsProps {
  /** Current funding percentage (0–100). Clamped internally. */
  currentPercent: number;
  /** History of milestone events for metric computation. */
  milestoneHistory?: MilestoneEvent[];
  /** Display layout. Default: "summary". */
  layout?: "summary" | "detailed" | "compact";
  /** Called when a new milestone metric is recorded. */
  onMetricRecorded?: (summary: MilestoneMetricsSummary) => void;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * @notice Clamps a numeric value to [0, 100].
 */
export function clampPercent(value: number): number {
  if (typeof value !== "number" || isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * @notice Validates a MilestoneEvent has positive timestamp and amounts.
 */
export function isValidEvent(event: MilestoneEvent): boolean {
  return (
    METRIC_MILESTONES.includes(event.threshold) &&
    Number.isFinite(event.reachedAt) &&
    event.reachedAt > 0 &&
    Number.isFinite(event.totalRaised) &&
    event.totalRaised >= 0 &&
    Number.isInteger(event.contributorCount) &&
    event.contributorCount >= 0
  );
}

/**
 * @notice Computes a summary from a list of milestone events.
 * @param events  Validated, chronologically ordered milestone events.
 * @returns       Computed summary metrics.
 */
export function computeMetricsSummary(events: MilestoneEvent[]): MilestoneMetricsSummary {
  const valid = events.filter(isValidEvent).slice(0, MAX_HISTORY_ENTRIES);

  if (valid.length === 0) {
    return { milestonesReached: 0, avgTimeBetweenMs: 0, fastestIntervalMs: 0, latestTotalRaised: 0, avgRaisedPerMilestone: 0 };
  }

  const sorted = [...valid].sort((a, b) => a.reachedAt - b.reachedAt);
  const latest = sorted[sorted.length - 1];

  let totalInterval = 0;
  let fastestInterval = Infinity;

  for (let i = 1; i < sorted.length; i++) {
    const interval = sorted[i].reachedAt - sorted[i - 1].reachedAt;
    totalInterval += interval;
    if (interval < fastestInterval) fastestInterval = interval;
  }

  const intervalCount = sorted.length - 1;
  const avgTimeBetweenMs = intervalCount > 0 ? Math.round(totalInterval / intervalCount) : 0;
  const fastestIntervalMs = intervalCount > 0 ? fastestInterval : 0;
  const avgRaisedPerMilestone = sorted.length > 0 ? Math.round(latest.totalRaised / sorted.length) : 0;

  return {
    milestonesReached: sorted.length,
    avgTimeBetweenMs,
    fastestIntervalMs,
    latestTotalRaised: latest.totalRaised,
    avgRaisedPerMilestone,
  };
}

/**
 * @notice Formats a duration in ms to a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * @notice Milestone metrics display component.
 */
const MilestoneMetrics: React.FC<MilestoneMetricsProps> = ({
  currentPercent,
  milestoneHistory = [],
  layout = "summary",
  onMetricRecorded,
}) => {
  const clamped = clampPercent(currentPercent);

  const summary = useMemo(
    () => computeMetricsSummary(milestoneHistory),
    [milestoneHistory],
  );

  const prevMilestones = React.useRef(0);
  React.useEffect(() => {
    if (summary.milestonesReached > prevMilestones.current) {
      prevMilestones.current = summary.milestonesReached;
      onMetricRecorded?.(summary);
    }
  }, [summary, onMetricRecorded]);

  const regionId = `metrics-${Math.random().toString(36).slice(2, 9)}`;

  if (layout === "compact") {
    return (
      <div className="milestone-metrics-compact" role="region" aria-label="Campaign milestone metrics" id={regionId}>
        <span className="metrics-compact-label">Milestones: {summary.milestonesReached}/4</span>
        <span className="metrics-compact-progress" aria-label={`${clamped}% funded`}>{clamped}%</span>
      </div>
    );
  }

  if (layout === "detailed") {
    return (
      <div className="milestone-metrics-detailed" role="region" aria-label="Campaign milestone metrics" id={regionId}>
        <h3 className="metrics-title">Milestone Metrics</h3>
        <div className="metrics-grid" aria-live="polite">
          <div className="metric-item">
            <span className="metric-label">Milestones Reached</span>
            <span className="metric-value" aria-label={`${summary.milestonesReached} milestones reached`}>
              {summary.milestonesReached} / 4
            </span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Avg Time Between</span>
            <span className="metric-value">{formatDuration(summary.avgTimeBetweenMs)}</span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Fastest Interval</span>
            <span className="metric-value">{formatDuration(summary.fastestIntervalMs)}</span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Latest Total Raised</span>
            <span className="metric-value" aria-label={`${summary.latestTotalRaised} tokens raised`}>
              {summary.latestTotalRaised.toLocaleString()}
            </span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Avg Raised / Milestone</span>
            <span className="metric-value">{summary.avgRaisedPerMilestone.toLocaleString()}</span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Current Progress</span>
            <span className="metric-value">{clamped}%</span>
          </div>
        </div>
        <div className="metrics-history">
          <h4>Milestone History</h4>
          {milestoneHistory.length === 0 ? (
            <p className="metrics-empty">No milestones reached yet.</p>
          ) : (
            <ul className="history-list">
              {milestoneHistory.filter(isValidEvent).map((e, i) => (
                <li key={`${e.threshold}-${i}`} className="history-item">
                  <span className="history-threshold">{e.threshold}%</span>
                  <span className="history-raised">{e.totalRaised.toLocaleString()} raised</span>
                  <span className="history-contributors">{e.contributorCount} contributors</span>
                  <span className="history-time">{new Date(e.reachedAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // Default: summary
  return (
    <div className="milestone-metrics-summary" role="region" aria-label="Campaign milestone metrics" id={regionId}>
      <h3 className="metrics-title">Milestone Summary</h3>
      <div className="metrics-row" aria-live="polite">
        <div className="metric-card">
          <span className="metric-label">Reached</span>
          <span className="metric-value">{summary.milestonesReached}/4</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Progress</span>
          <span className="metric-value">{clamped}%</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Avg Interval</span>
          <span className="metric-value">{formatDuration(summary.avgTimeBetweenMs)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Total Raised</span>
          <span className="metric-value">{summary.latestTotalRaised.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

export default MilestoneMetrics;
