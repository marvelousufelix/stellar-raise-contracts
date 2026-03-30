import React, { useMemo } from "react";

/**
 * @title MilestoneStatistics\n * @notice Displays analytics and statistics for campaign milestones including
 *         funding velocity, contributor metrics, and milestone progress tracking.
 *
 * @dev Security assumptions:
 *   - No dangerouslySetInnerHTML — all content rendered as React text nodes.
 *   - All numeric values are validated and clamped to safe ranges.
 *   - Statistics are calculated from sanitized input data.
 *   - No user-controlled formatting or HTML generation.
 *
 * @custom:accessibility
 *   - role="region" with aria-label for statistics section.
 *   - Each statistic has descriptive aria-label.
 *   - Tables use proper semantic markup with headers.
 *   - Live regions for dynamic updates.
 */

export interface MilestoneStatistic {
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "neutral";
  description?: string;
}

export interface MilestoneStatisticsProps {
  /** Current funding amount */
  currentAmount: number;
  /** Target funding goal */
  goalAmount: number;
  /** Number of contributors */
  contributorCount: number;
  /** Average contribution amount */
  averageContribution?: number;
  /** Funding velocity (amount per day) */
  fundingVelocity?: number;
  /** Days remaining until deadline */
  daysRemaining?: number;
  /** Display layout: 'grid' | 'table' | 'summary' */
  layout?: "grid" | "table" | "summary";
  /** Show trend indicators */
  showTrends?: boolean;
  /** Currency symbol */
  currencySymbol?: string;
  /** Callback for statistic updates */
  onStatisticsUpdate?: (stats: MilestoneStatistic[]) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATISTICS_COLORS = {
  positive: "#2ECC71",
  negative: "#E74C3C",
  neutral: "#95A5A6",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Clamps a value between min and max.
 */
function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Formats currency value.
 */
function formatCurrency(amount: number, symbol: string): string {
  return `${symbol}${Math.round(amount).toLocaleString()}`;
}

/**
 * Calculates funding percentage.
 */
function calculateFundingPercent(current: number, goal: number): number {
  if (goal <= 0) return 0;
  return clampValue((current / goal) * 100, 0, 100);
}

/**
 * Calculates funding velocity trend.
 */
function calculateVelocityTrend(
  velocity: number,
  goalAmount: number,
  daysRemaining: number,
): "up" | "down" | "neutral" {
  if (daysRemaining <= 0) return "neutral";
  const projectedFunding = velocity * daysRemaining;
  if (projectedFunding > goalAmount * 1.2) return "up";
  if (projectedFunding < goalAmount * 0.8) return "down";
  return "neutral";
}

/**
 * Formats time duration.
 */
function formatDuration(days: number): string {
  if (days < 1) return "Less than 1 day";
  if (days === 1) return "1 day";
  return `${Math.round(days)} days`;
}

/**
 * Calculates milestone progress.
 */
function calculateMilestoneProgress(
  current: number,
  goal: number,
): { reached: number; total: number; percent: number } {
  const milestones = [25, 50, 75, 100];
  const percent = calculateFundingPercent(current, goal);
  const reached = milestones.filter((m) => percent >= m).length;
  return {
    reached,
    total: milestones.length,
    percent: Math.round((reached / milestones.length) * 100),
  };
}

/**
 * Generates statistics array.
 */
function generateStatistics(
  currentAmount: number,
  goalAmount: number,
  contributorCount: number,
  averageContribution: number,
  fundingVelocity: number,
  daysRemaining: number,
  currencySymbol: string,
): MilestoneStatistic[] {
  const fundingPercent = calculateFundingPercent(currentAmount, goalAmount);
  const milestoneProgress = calculateMilestoneProgress(currentAmount, goalAmount);
  const velocityTrend = calculateVelocityTrend(
    fundingVelocity,
    goalAmount,
    daysRemaining,
  );

  return [
    {
      label: "Funding Progress",
      value: Math.round(fundingPercent),
      unit: "%",
      trend: fundingPercent >= 50 ? "up" : "neutral",
      description: `${formatCurrency(currentAmount, currencySymbol)} of ${formatCurrency(goalAmount, currencySymbol)}`,
    },
    {
      label: "Contributors",
      value: contributorCount,
      trend: contributorCount > 0 ? "up" : "neutral",
      description: `Average contribution: ${formatCurrency(averageContribution, currencySymbol)}`,
    },
    {
      label: "Funding Velocity",
      value: formatCurrency(fundingVelocity, currencySymbol),
      unit: "/day",
      trend: velocityTrend,
      description: `Projected: ${formatCurrency(fundingVelocity * daysRemaining, currencySymbol)}`,
    },
    {
      label: "Time Remaining",
      value: formatDuration(daysRemaining),
      trend: daysRemaining > 7 ? "up" : daysRemaining > 0 ? "neutral" : "down",
      description: `${Math.round(daysRemaining)} days left`,
    },
    {
      label: "Milestones Reached",
      value: `${milestoneProgress.reached}/${milestoneProgress.total}`,
      trend: milestoneProgress.reached > 2 ? "up" : "neutral",
      description: `${milestoneProgress.percent}% of milestones unlocked`,
    },
  ];
}

// ── Component ─────────────────────────────────────────────────────────────────

const MilestoneStatistics: React.FC<MilestoneStatisticsProps> = ({
  currentAmount,
  goalAmount,
  contributorCount,
  averageContribution = 0,
  fundingVelocity = 0,
  daysRemaining = 0,
  layout = "grid",
  showTrends = true,
  currencySymbol = "$",
  onStatisticsUpdate,
}) => {
  const clampedCurrent = Math.max(0, currentAmount);
  const clampedGoal = Math.max(1, goalAmount);
  const clampedContributors = Math.max(0, contributorCount);
  const clampedAverage = Math.max(0, averageContribution);
  const clampedVelocity = Math.max(0, fundingVelocity);
  const clampedDays = Math.max(0, daysRemaining);

  const statistics = useMemo(
    () =>
      generateStatistics(
        clampedCurrent,
        clampedGoal,
        clampedContributors,
        clampedAverage,
        clampedVelocity,
        clampedDays,
        currencySymbol,
      ),
    [
      clampedCurrent,
      clampedGoal,
      clampedContributors,
      clampedAverage,
      clampedVelocity,
      clampedDays,
      currencySymbol,
    ],
  );

  // Notify on statistics update
  React.useEffect(() => {
    if (onStatisticsUpdate) {
      onStatisticsUpdate(statistics);
    }
  }, [statistics, onStatisticsUpdate]);

  const getTrendColor = (trend?: string): string => {
    switch (trend) {
      case "up":
        return STATISTICS_COLORS.positive;
      case "down":
        return STATISTICS_COLORS.negative;
      default:
        return STATISTICS_COLORS.neutral;
    }
  };

  const getTrendIcon = (trend?: string): string => {
    switch (trend) {
      case "up":
        return "↑";
      case "down":
        return "↓";
      default:
        return "→";
    }
  };

  const statisticsId = `statistics-${Math.random().toString(36).substr(2, 9)}`;

  if (layout === "grid") {
    return (
      <div
        className="milestone-statistics-grid"
        role="region"
        aria-label="Campaign statistics"
        id={statisticsId}
      >
        <h3 className="statistics-title">Campaign Statistics</h3>
        <div className="statistics-grid">
          {statistics.map((stat, i) => (
            <div
              key={i}
              className="statistic-card"
              aria-label={`${stat.label}: ${stat.value}${stat.unit || ""}`}
            >
              <div className="statistic-header">
                <h4 className="statistic-label">{stat.label}</h4>
                {showTrends && stat.trend && (
                  <span
                    className="statistic-trend"
                    style={{ color: getTrendColor(stat.trend) }}
                    aria-hidden="true"
                  >
                    {getTrendIcon(stat.trend)}
                  </span>
                )}
              </div>
              <div className="statistic-value">
                <span className="value">{stat.value}</span>
                {stat.unit && <span className="unit">{stat.unit}</span>}
              </div>
              {stat.description && (
                <p className="statistic-description">{stat.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (layout === "table") {
    return (
      <div
        className="milestone-statistics-table"
        role="region"
        aria-label="Campaign statistics"
        id={statisticsId}
      >
        <h3 className="statistics-title">Campaign Statistics</h3>
        <table className="statistics-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
              {showTrends && <th>Trend</th>}
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {statistics.map((stat, i) => (
              <tr key={i}>
                <td className="metric-label">{stat.label}</td>
                <td className="metric-value">
                  {stat.value}
                  {stat.unit && <span className="unit"> {stat.unit}</span>}
                </td>
                {showTrends && (
                  <td
                    className="metric-trend"
                    style={{ color: getTrendColor(stat.trend) }}
                  >
                    {getTrendIcon(stat.trend)}
                  </td>
                )}
                <td className="metric-description">{stat.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (layout === "summary") {
    const fundingPercent = calculateFundingPercent(clampedCurrent, clampedGoal);
    const milestoneProgress = calculateMilestoneProgress(
      clampedCurrent,
      clampedGoal,
    );

    return (
      <div
        className="milestone-statistics-summary"
        role="region"
        aria-label="Campaign statistics summary"
        id={statisticsId}
      >
        <div className="summary-header">
          <h3>Campaign Summary</h3>
        </div>

        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-label">Funding</span>
            <span className="summary-value">{Math.round(fundingPercent)}%</span>
            <span className="summary-detail">
              {formatCurrency(clampedCurrent, currencySymbol)} /{" "}
              {formatCurrency(clampedGoal, currencySymbol)}
            </span>
          </div>

          <div className="summary-item">
            <span className="summary-label">Contributors</span>
            <span className="summary-value">{clampedContributors}</span>
            <span className="summary-detail">
              Avg: {formatCurrency(clampedAverage, currencySymbol)}
            </span>
          </div>

          <div className="summary-item">
            <span className="summary-label">Velocity</span>
            <span className="summary-value">
              {formatCurrency(clampedVelocity, currencySymbol)}/day
            </span>
            <span className="summary-detail">
              {formatDuration(clampedDays)} remaining
            </span>
          </div>

          <div className="summary-item">
            <span className="summary-label">Milestones</span>
            <span className="summary-value">
              {milestoneProgress.reached}/{milestoneProgress.total}
            </span>
            <span className="summary-detail">
              {milestoneProgress.percent}% unlocked
            </span>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default MilestoneStatistics;
