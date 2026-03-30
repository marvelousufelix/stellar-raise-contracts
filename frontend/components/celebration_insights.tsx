import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * @title CelebrationInsights
 * @notice Campaign milestone celebration insights panel for the Stellar Raise
 *         crowdfunding dApp. Surfaces funding velocity, contributor trends, and
 *         strategic planning recommendations alongside milestone celebrations.
 *
 * @dev This module exports:
 *   - Pure helper functions (all exported for independent unit testing)
 *   - `InsightCard`          — reusable single-insight display card
 *   - `InsightPanel`         — grid of insight cards with loading/empty states
 *   - `CelebrationInsights`  — main component combining celebration + insights
 *
 * @custom:efficiency
 *   - `useMemo` derives insight data only when `milestones` or `metrics` change.
 *   - `useCallback` stabilises event handlers to prevent child re-renders.
 *   - `useRef` manages auto-dismiss timers to prevent memory leaks.
 *   - Insight computations are pure functions — safe to memoize.
 *
 * @custom:security
 *   - No `dangerouslySetInnerHTML` is used anywhere in this module.
 *   - All user-supplied strings are rendered as React text nodes (XSS-safe).
 *   - Numeric inputs are clamped/validated before use in calculations.
 *   - Percentage values are clamped to [0, 100] before CSS injection.
 *
 * @custom:accessibility
 *   - `role="region"` with `aria-label` on the insights panel.
 *   - `role="status"` on the celebration overlay for screen-reader announcements.
 *   - `aria-live="polite"` on dynamic insight updates.
 *   - All interactive elements meet 44×44 px minimum touch target.
 *   - Decorative icons carry `aria-hidden="true"`.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default auto-dismiss delay for the celebration overlay (ms). */
export const DEFAULT_AUTO_DISMISS_MS = 5_000;

/** Maximum length for campaign name display. */
export const MAX_CAMPAIGN_NAME_LENGTH = 80;

/** Maximum number of insights shown in the panel. */
export const MAX_INSIGHTS = 6;

/** Minimum funding velocity (tokens/day) considered "strong". */
export const STRONG_VELOCITY_THRESHOLD = 1_000;

/** Minimum contributor count considered "high engagement". */
export const HIGH_ENGAGEMENT_THRESHOLD = 10;

// ── Types ─────────────────────────────────────────────────────────────────────

/** All supported milestone status values. */
export type MilestoneStatus = "pending" | "reached" | "celebrated" | "failed";

/** Insight category tags used for filtering and display. */
export type InsightCategory =
  | "velocity"
  | "engagement"
  | "projection"
  | "strategy"
  | "celebration"
  | "warning";

/** Severity level for an insight. */
export type InsightSeverity = "info" | "success" | "warning" | "critical";

/**
 * @notice A single milestone definition.
 */
export interface Milestone {
  id: string;
  label: string;
  targetPercent: number;
  status: MilestoneStatus;
  reachedAt?: number;
}

/**
 * @notice Campaign metrics used to derive insights.
 *
 * @param totalRaised       Total tokens raised so far.
 * @param goal              Campaign funding goal.
 * @param contributorCount  Number of unique contributors.
 * @param daysRemaining     Days until campaign deadline (0 = expired).
 * @param dailyVelocity     Average tokens raised per day over the last 7 days.
 * @param largestContrib    Largest single contribution amount.
 */
export interface CampaignMetrics {
  totalRaised: number;
  goal: number;
  contributorCount: number;
  daysRemaining: number;
  dailyVelocity: number;
  largestContrib: number;
}

/**
 * @notice A single derived insight shown in the panel.
 */
export interface Insight {
  id: string;
  category: InsightCategory;
  severity: InsightSeverity;
  title: string;
  body: string;
  value?: string;
}

/**
 * @notice Props for `InsightCard`.
 */
export interface InsightCardProps {
  insight: Insight;
  "data-testid"?: string;
}

/**
 * @notice Props for `InsightPanel`.
 */
export interface InsightPanelProps {
  insights: Insight[];
  isLoading?: boolean;
  campaignName?: string;
}

/**
 * @notice Props for `CelebrationInsights`.
 */
export interface CelebrationInsightsProps {
  milestones: Milestone[];
  currentPercent: number;
  metrics: CampaignMetrics;
  campaignName?: string;
  autoDismissMs?: number;
  onDismiss?: () => void;
  onMilestoneReach?: (milestone: Milestone) => void;
  showInsights?: boolean;
  className?: string;
  id?: string;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * @title clampPercent
 * @notice Clamps a value to [0, 100]. Returns 0 for NaN or Infinity.
 */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/**
 * @title safeString
 * @notice Trims and truncates a string to `maxLen`. Returns `fallback` for
 *         non-string or empty input.
 */
export function safeString(
  value: unknown,
  fallback: string,
  maxLen = 200,
): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

/**
 * @title computeFundingPercent
 * @notice Returns funding progress as a percentage (0–100), clamped.
 * @param totalRaised Current total raised.
 * @param goal        Campaign goal.
 */
export function computeFundingPercent(totalRaised: number, goal: number): number {
  if (!Number.isFinite(goal) || goal <= 0) return 0;
  if (!Number.isFinite(totalRaised) || totalRaised <= 0) return 0;
  return clampPercent((totalRaised / goal) * 100);
}

/**
 * @title computeDaysToGoal
 * @notice Estimates days to reach the goal at the current daily velocity.
 *         Returns `null` when velocity is zero or goal is already met.
 * @param totalRaised   Current total raised.
 * @param goal          Campaign goal.
 * @param dailyVelocity Average tokens raised per day.
 */
export function computeDaysToGoal(
  totalRaised: number,
  goal: number,
  dailyVelocity: number,
): number | null {
  if (!Number.isFinite(totalRaised) || !Number.isFinite(goal)) return null;
  if (!Number.isFinite(dailyVelocity) || dailyVelocity <= 0) return null;
  if (totalRaised >= goal) return null;
  const remaining = goal - totalRaised;
  return Math.ceil(remaining / dailyVelocity);
}

/**
 * @title getActiveMilestone
 * @notice Returns the first milestone with status `"reached"`, or `null`.
 */
export function getActiveMilestone(milestones: Milestone[]): Milestone | null {
  if (!Array.isArray(milestones)) return null;
  return milestones.find((m) => m.status === "reached") ?? null;
}

/**
 * @title formatInsightValue
 * @notice Formats a numeric value for display in an insight card.
 *         Large numbers are abbreviated (e.g. 1 500 000 → "1.5M").
 */
export function formatInsightValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

/**
 * @title deriveInsights
 * @notice Derives up to `MAX_INSIGHTS` insights from campaign metrics and
 *         milestone state.
 *
 * @param metrics    Current campaign metrics.
 * @param milestones Array of milestone definitions.
 * @return Array of `Insight` objects, ordered by severity (critical first).
 *
 * @custom:security All numeric inputs are validated before use. No user
 *                  strings are interpolated into insight bodies without
 *                  sanitization via `safeString`.
 */
export function deriveInsights(
  metrics: CampaignMetrics,
  milestones: Milestone[],
): Insight[] {
  if (!metrics || typeof metrics !== "object") return [];

  const insights: Insight[] = [];
  const {
    totalRaised = 0,
    goal = 0,
    contributorCount = 0,
    daysRemaining = 0,
    dailyVelocity = 0,
    largestContrib = 0,
  } = metrics;

  const fundingPct = computeFundingPercent(totalRaised, goal);
  const daysToGoal = computeDaysToGoal(totalRaised, goal, dailyVelocity);

  // 1. Funding velocity insight
  if (Number.isFinite(dailyVelocity) && dailyVelocity > 0) {
    const isStrong = dailyVelocity >= STRONG_VELOCITY_THRESHOLD;
    insights.push({
      id: "velocity",
      category: "velocity",
      severity: isStrong ? "success" : "info",
      title: "Funding Velocity",
      body: isStrong
        ? "Strong daily momentum — keep promoting to maintain pace."
        : "Moderate pace. Consider sharing on social channels to accelerate.",
      value: `${formatInsightValue(dailyVelocity)}/day`,
    });
  }

  // 2. Days-to-goal projection
  if (daysToGoal !== null) {
    const onTrack = daysToGoal <= daysRemaining;
    insights.push({
      id: "projection",
      category: "projection",
      severity: onTrack ? "success" : "warning",
      title: "Goal Projection",
      body: onTrack
        ? `On track to reach goal in ~${daysToGoal} day${daysToGoal === 1 ? "" : "s"}.`
        : `At current pace, goal reached in ~${daysToGoal} days — ${daysRemaining} days remain.`,
      value: `~${daysToGoal}d`,
    });
  }

  // 3. Contributor engagement
  if (Number.isFinite(contributorCount) && contributorCount > 0) {
    const highEngagement = contributorCount >= HIGH_ENGAGEMENT_THRESHOLD;
    insights.push({
      id: "engagement",
      category: "engagement",
      severity: highEngagement ? "success" : "info",
      title: "Contributor Engagement",
      body: highEngagement
        ? "High contributor count signals strong community interest."
        : "Growing contributor base. Early backers drive social proof.",
      value: String(contributorCount),
    });
  }

  // 4. Deadline urgency warning
  if (Number.isFinite(daysRemaining) && daysRemaining > 0 && daysRemaining <= 3 && fundingPct < 100) {
    insights.push({
      id: "urgency",
      category: "warning",
      severity: "critical",
      title: "Deadline Approaching",
      body: `Only ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left. Urgency messaging can boost last-minute contributions.`,
      value: `${daysRemaining}d left`,
    });
  }

  // 5. Whale contributor strategy
  if (Number.isFinite(largestContrib) && largestContrib > 0 && goal > 0) {
    const whalePct = clampPercent((largestContrib / goal) * 100);
    if (whalePct >= 20) {
      insights.push({
        id: "whale",
        category: "strategy",
        severity: "info",
        title: "Large Contributor Detected",
        body: `Top contribution represents ${whalePct.toFixed(0)}% of goal. Diversifying your contributor base reduces concentration risk.`,
        value: `${whalePct.toFixed(0)}%`,
      });
    }
  }

  // 6. Milestone celebration insight
  const active = getActiveMilestone(milestones);
  if (active) {
    insights.push({
      id: `milestone-${active.id}`,
      category: "celebration",
      severity: "success",
      title: "Milestone Reached",
      body: `"${safeString(active.label, "Milestone", 60)}" has been reached. Share this achievement to build momentum.`,
      value: `${clampPercent(active.targetPercent)}%`,
    });
  }

  // Sort: critical → warning → success → info, then cap at MAX_INSIGHTS.
  const order: Record<InsightSeverity, number> = {
    critical: 0,
    warning: 1,
    success: 2,
    info: 3,
  };
  insights.sort((a, b) => order[a.severity] - order[b.severity]);

  return insights.slice(0, MAX_INSIGHTS);
}

// ── Severity helpers ──────────────────────────────────────────────────────────

const SEVERITY_ICONS: Record<InsightSeverity, string> = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
  critical: "🚨",
};

const SEVERITY_COLORS: Record<InsightSeverity, string> = {
  info: "#3b82f6",
  success: "#00C853",
  warning: "#f59e0b",
  critical: "#ef4444",
};

// ── InsightCard ───────────────────────────────────────────────────────────────

/**
 * @title InsightCard
 * @notice Renders a single campaign insight with icon, title, body, and value.
 */
export const InsightCard: React.FC<InsightCardProps> = ({
  insight,
  "data-testid": testId,
}) => {
  const color = SEVERITY_COLORS[insight.severity] ?? SEVERITY_COLORS.info;
  const icon = SEVERITY_ICONS[insight.severity] ?? SEVERITY_ICONS.info;

  return (
    <div
      style={{ ...cardStyles.card, borderLeftColor: color }}
      data-testid={testId ?? `insight-card-${insight.id}`}
      role="article"
      aria-label={`${insight.title}: ${insight.body}`}
    >
      <div style={cardStyles.header}>
        <span aria-hidden="true" style={cardStyles.icon}>
          {icon}
        </span>
        <span style={cardStyles.title}>{safeString(insight.title, "Insight", 80)}</span>
        {insight.value !== undefined && (
          <span style={{ ...cardStyles.value, color }} aria-label={`Value: ${insight.value}`}>
            {safeString(insight.value, "", 20)}
          </span>
        )}
      </div>
      <p style={cardStyles.body}>{safeString(insight.body, "", 300)}</p>
    </div>
  );
};

// ── InsightPanel ──────────────────────────────────────────────────────────────

/**
 * @title InsightPanel
 * @notice Renders a grid of `InsightCard` components with loading and empty states.
 */
export const InsightPanel: React.FC<InsightPanelProps> = ({
  insights,
  isLoading = false,
  campaignName,
}) => {
  const safeName = campaignName
    ? safeString(campaignName, "", MAX_CAMPAIGN_NAME_LENGTH)
    : undefined;

  const label = safeName
    ? `Campaign insights for ${safeName}`
    : "Campaign insights";

  if (isLoading) {
    return (
      <div
        role="region"
        aria-label={label}
        aria-busy="true"
        data-testid="insight-panel-loading"
        style={panelStyles.root}
      >
        <p style={panelStyles.empty} aria-live="polite">
          Loading insights…
        </p>
      </div>
    );
  }

  if (!Array.isArray(insights) || insights.length === 0) {
    return (
      <div
        role="region"
        aria-label={label}
        data-testid="insight-panel-empty"
        style={panelStyles.root}
      >
        <p style={panelStyles.empty}>No insights available yet.</p>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label={label}
      aria-live="polite"
      data-testid="insight-panel"
      style={panelStyles.root}
    >
      <h3 style={panelStyles.heading} aria-hidden="true">
        Campaign Insights
      </h3>
      <div style={panelStyles.grid} data-testid="insight-grid">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  );
};

// ── CelebrationInsights (main component) ─────────────────────────────────────

/**
 * @title CelebrationInsights
 * @notice Combines milestone celebration overlay with a strategic insights panel.
 *
 * @dev Renders:
 *   1. A celebration overlay when a milestone has status `"reached"`.
 *   2. An `InsightPanel` derived from `metrics` and `milestones`.
 */
const CelebrationInsights: React.FC<CelebrationInsightsProps> = ({
  milestones,
  currentPercent,
  metrics,
  campaignName,
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
  onDismiss,
  onMilestoneReach,
  showInsights = true,
  className,
  id,
}) => {
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeMilestones = Array.isArray(milestones) ? milestones : [];
  const clamped = clampPercent(currentPercent);
  const safeName = campaignName
    ? safeString(campaignName, "", MAX_CAMPAIGN_NAME_LENGTH)
    : undefined;

  const activeMilestone = useMemo(
    () => getActiveMilestone(safeMilestones),
    [safeMilestones],
  );

  const insights = useMemo(
    () => (showInsights ? deriveInsights(metrics, safeMilestones) : []),
    [metrics, safeMilestones, showInsights],
  );

  // Fire onMilestoneReach callback when a new milestone is detected.
  useEffect(() => {
    if (activeMilestone && onMilestoneReach) {
      onMilestoneReach(activeMilestone);
    }
  }, [activeMilestone, onMilestoneReach]);

  // Auto-dismiss timer.
  useEffect(() => {
    if (!activeMilestone || dismissed || autoDismissMs <= 0) return;
    timerRef.current = setTimeout(() => {
      setDismissed(true);
      onDismiss?.();
    }, autoDismissMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeMilestone, dismissed, autoDismissMs, onDismiss]);

  const handleDismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setDismissed(true);
    onDismiss?.();
  }, [onDismiss]);

  const showCelebration = !!activeMilestone && !dismissed;

  return (
    <div
      id={id}
      className={className}
      style={rootStyles.root}
      data-testid="celebration-insights-root"
    >
      {/* Celebration overlay */}
      {showCelebration && (
        <div
          role="status"
          aria-live="polite"
          aria-label={`Milestone reached: ${safeString(activeMilestone.label, "Milestone", 60)}${safeName ? ` for campaign ${safeName}` : ""}`}
          style={rootStyles.celebrationPanel}
          data-testid="celebration-panel"
        >
          <button
            onClick={handleDismiss}
            aria-label="Dismiss milestone celebration"
            style={rootStyles.dismissButton}
            type="button"
            data-testid="dismiss-button"
          >
            <span aria-hidden="true">✕</span>
          </button>

          <span aria-hidden="true" style={rootStyles.celebrationIcon}>
            🎉
          </span>

          {safeName && (
            <p style={rootStyles.campaignName} data-testid="campaign-name">
              {safeName}
            </p>
          )}

          <h2 style={rootStyles.celebrationTitle}>Milestone Reached!</h2>

          <p style={rootStyles.celebrationLabel} data-testid="milestone-label">
            {safeString(activeMilestone.label, "Milestone", 60)}
          </p>

          <p style={rootStyles.celebrationPercent} data-testid="milestone-percent">
            {clampPercent(activeMilestone.targetPercent)}% of goal
          </p>

          {autoDismissMs > 0 && (
            <p style={rootStyles.autoDismissHint} aria-live="off">
              This message will dismiss automatically.
            </p>
          )}
        </div>
      )}

      {/* Progress indicator */}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={safeName ? `${safeName} funding progress` : "Campaign funding progress"}
        style={{ ...rootStyles.progressBar, width: "100%" }}
        data-testid="progress-bar"
      >
        <div
          style={{
            ...rootStyles.progressFill,
            width: `${clamped}%`,
          }}
          data-testid="progress-fill"
        />
      </div>

      {/* Insights panel */}
      {showInsights && (
        <InsightPanel
          insights={insights}
          campaignName={safeName}
        />
      )}
    </div>
  );
};

export default CelebrationInsights;

// ── Inline styles ─────────────────────────────────────────────────────────────

const rootStyles = {
  root: {
    fontFamily:
      "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    width: "100%",
  } as React.CSSProperties,

  celebrationPanel: {
    position: "relative" as const,
    backgroundColor: "#f0fdf4",
    border: "2px solid #00C853",
    borderRadius: "0.75rem",
    padding: "1.5rem",
    marginBottom: "1rem",
    textAlign: "center" as const,
    boxShadow: "0 4px 6px -1px rgba(0, 200, 83, 0.15)",
  } as React.CSSProperties,

  dismissButton: {
    position: "absolute" as const,
    top: "0.75rem",
    right: "0.75rem",
    minWidth: "44px",
    minHeight: "44px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "1px solid #d1d5db",
    borderRadius: "0.375rem",
    cursor: "pointer",
    fontSize: "1rem",
    color: "#6b7280",
  } as React.CSSProperties,

  celebrationIcon: { fontSize: "2.5rem", display: "block", marginBottom: "0.5rem" } as React.CSSProperties,
  campaignName: { fontSize: "0.875rem", color: "#6b7280", margin: "0 0 0.25rem" } as React.CSSProperties,
  celebrationTitle: { fontSize: "1.5rem", fontWeight: 700, color: "#00C853", margin: "0 0 0.5rem" } as React.CSSProperties,
  celebrationLabel: { fontSize: "1.125rem", color: "#111827", margin: "0 0 0.25rem" } as React.CSSProperties,
  celebrationPercent: { fontSize: "1rem", color: "#374151", margin: "0 0 0.5rem" } as React.CSSProperties,
  autoDismissHint: { fontSize: "0.75rem", color: "#9ca3af", margin: 0 } as React.CSSProperties,

  progressBar: {
    height: "8px",
    backgroundColor: "#e5e7eb",
    borderRadius: "9999px",
    overflow: "hidden",
    marginBottom: "1rem",
  } as React.CSSProperties,

  progressFill: {
    height: "100%",
    backgroundColor: "#00C853",
    borderRadius: "9999px",
    transition: "width 0.3s ease",
  } as React.CSSProperties,
};

const cardStyles = {
  card: {
    backgroundColor: "#ffffff",
    border: "1px solid #e5e7eb",
    borderLeft: "4px solid",
    borderRadius: "0.5rem",
    padding: "0.875rem 1rem",
  } as React.CSSProperties,

  header: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.375rem",
  } as React.CSSProperties,

  icon: { fontSize: "1rem", flexShrink: 0 } as React.CSSProperties,

  title: {
    flex: 1,
    fontWeight: 600,
    fontSize: "0.875rem",
    color: "#111827",
  } as React.CSSProperties,

  value: {
    fontWeight: 700,
    fontSize: "0.875rem",
    flexShrink: 0,
  } as React.CSSProperties,

  body: {
    margin: 0,
    fontSize: "0.8125rem",
    color: "#6b7280",
    lineHeight: 1.5,
  } as React.CSSProperties,
};

const panelStyles = {
  root: {
    marginTop: "1rem",
  } as React.CSSProperties,

  heading: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#111827",
    margin: "0 0 0.75rem",
  } as React.CSSProperties,

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: "0.75rem",
  } as React.CSSProperties,

  empty: {
    fontSize: "0.875rem",
    color: "#9ca3af",
    margin: 0,
  } as React.CSSProperties,
};
