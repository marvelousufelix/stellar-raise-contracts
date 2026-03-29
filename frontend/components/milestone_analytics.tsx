import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * @title MilestoneAnalytics
 * @notice Campaign milestone celebration analytics panel for the Stellar Raise
 *         crowdfunding dApp. Tracks milestone events, computes business-intelligence
 *         metrics (conversion rate, velocity trend, engagement score), and renders
 *         a dismissible celebration overlay alongside a live analytics dashboard.
 *
 * @dev Exports:
 *   - Pure helper functions (all exported for independent unit testing)
 *   - `AnalyticsCard`       — single KPI display card
 *   - `AnalyticsDashboard`  — grid of KPI cards with loading/empty states
 *   - `MilestoneAnalytics`  — main component: celebration overlay + analytics
 *
 * @custom:security
 *   - No `dangerouslySetInnerHTML` anywhere in this module.
 *   - All user-supplied strings are rendered as React text nodes (XSS-safe).
 *   - Numeric inputs are clamped/validated before use in calculations.
 *   - Percentage values are clamped to [0, 100] before CSS injection.
 *   - Auto-dismiss timers are cleared on unmount to prevent memory leaks.
 *   - Callbacks are guarded against post-unmount calls via `mountedRef`.
 *
 * @custom:accessibility
 *   - `role="region"` with `aria-label` on the analytics dashboard.
 *   - `role="status"` + `aria-live="polite"` on the celebration overlay.
 *   - All interactive elements meet 44×44 px minimum touch target.
 *   - Decorative icons carry `aria-hidden="true"`.
 *   - Progress bars use `role="progressbar"` with `aria-valuenow/min/max`.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Supported milestone thresholds as funding percentages. */
export const ANALYTICS_MILESTONES = [25, 50, 75, 100] as const;
export type AnalyticsMilestone = (typeof ANALYTICS_MILESTONES)[number];

/** Default auto-dismiss delay for the celebration overlay (ms). */
export const DEFAULT_ANALYTICS_DISMISS_MS = 5_000;

/** Maximum characters for campaign name display. */
export const MAX_ANALYTICS_NAME_LENGTH = 80;

/** Maximum number of KPI cards shown in the dashboard. */
export const MAX_KPI_CARDS = 6;

/** Minimum daily velocity (tokens/day) considered "strong". */
export const STRONG_VELOCITY_THRESHOLD = 1_000;

/** Minimum contributor count considered "high engagement". */
export const HIGH_ENGAGEMENT_THRESHOLD = 10;

/** Minimum conversion rate (%) considered "healthy". */
export const HEALTHY_CONVERSION_RATE = 5;

// ── Types ─────────────────────────────────────────────────────────────────────

/** KPI card severity level. */
export type KpiSeverity = "info" | "success" | "warning" | "critical";

/** KPI category tag. */
export type KpiCategory =
  | "funding"
  | "velocity"
  | "engagement"
  | "conversion"
  | "projection"
  | "celebration";

/**
 * @notice A single KPI metric for the analytics dashboard.
 */
export interface KpiMetric {
  id: string;
  category: KpiCategory;
  severity: KpiSeverity;
  label: string;
  value: string;
  subtext?: string;
  trend?: "up" | "down" | "flat";
}

/**
 * @notice Campaign metrics used to derive analytics KPIs.
 *
 * @param totalRaised       Total tokens raised so far.
 * @param goal              Campaign funding goal.
 * @param contributorCount  Number of unique contributors.
 * @param pageViews         Total campaign page views.
 * @param daysRemaining     Days until campaign deadline (0 = expired).
 * @param dailyVelocity     Average tokens raised per day (last 7 days).
 * @param previousVelocity  Average tokens raised per day (prior 7-day window).
 * @param largestContrib    Largest single contribution amount.
 */
export interface AnalyticsMetrics {
  totalRaised: number;
  goal: number;
  contributorCount: number;
  pageViews: number;
  daysRemaining: number;
  dailyVelocity: number;
  previousVelocity: number;
  largestContrib: number;
}

/**
 * @notice A recorded milestone event for the analytics event log.
 */
export interface MilestoneEvent {
  threshold: AnalyticsMilestone;
  reachedAt: number; // Unix timestamp ms
  contributorCount: number;
  totalRaised: number;
}

/**
 * @notice Props for `AnalyticsCard`.
 */
export interface AnalyticsCardProps {
  kpi: KpiMetric;
  "data-testid"?: string;
}

/**
 * @notice Props for `AnalyticsDashboard`.
 */
export interface AnalyticsDashboardProps {
  kpis: KpiMetric[];
  isLoading?: boolean;
  campaignName?: string;
}

/**
 * @notice Props for `MilestoneAnalytics`.
 */
export interface MilestoneAnalyticsProps {
  /** Current funding percentage (0–100). Clamped internally. */
  currentPercent: number;
  /** Campaign metrics for KPI derivation. */
  metrics: AnalyticsMetrics;
  /** Optional campaign name shown in the overlay and dashboard header. */
  campaignName?: string;
  /** Auto-dismiss delay in ms. 0 disables auto-dismiss. Default: 5000. */
  autoDismissMs?: number;
  /** Called when a new milestone is reached. */
  onMilestone?: (event: MilestoneEvent) => void;
  /** Called when the celebration overlay is dismissed. */
  onDismiss?: (threshold: AnalyticsMilestone) => void;
  /** Whether to show the analytics dashboard below the overlay. Default: true. */
  showDashboard?: boolean;
  /** Additional CSS class for the root element. */
  className?: string;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * @title clampAnalyticsPercent
 * @notice Clamps a value to [0, 100]. Returns 0 for NaN or non-finite input.
 * @param value Raw percentage.
 * @returns Clamped value in [0, 100].
 */
export function clampAnalyticsPercent(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/**
 * @title sanitizeAnalyticsString
 * @notice Sanitizes a user-supplied string for safe display.
 *   - Rejects non-strings.
 *   - Strips control characters (U+0000–U+001F, U+007F).
 *   - Collapses whitespace.
 *   - Truncates to maxLength.
 * @param input     Raw string.
 * @param maxLength Maximum allowed length.
 * @returns Sanitized string, or "" on invalid input.
 */
export function sanitizeAnalyticsString(input: unknown, maxLength: number): string {
  if (typeof input !== "string") return "";
  const cleaned = input
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, maxLength);
}

/**
 * @title resolveAnalyticsMilestone
 * @notice Returns the lowest uncelebrated milestone crossed by currentPercent.
 * @param currentPercent Clamped progress percentage.
 * @param celebrated     Set of already-celebrated thresholds.
 * @returns Next threshold to celebrate, or null if none.
 */
export function resolveAnalyticsMilestone(
  currentPercent: number,
  celebrated: ReadonlySet<AnalyticsMilestone>,
): AnalyticsMilestone | null {
  for (const t of ANALYTICS_MILESTONES) {
    if (currentPercent >= t && !celebrated.has(t)) return t;
  }
  return null;
}

/**
 * @title getMilestoneAnalyticsContent
 * @notice Returns the icon and heading for a given milestone threshold.
 * @param threshold Milestone threshold.
 * @returns Object with icon and heading strings.
 */
export function getMilestoneAnalyticsContent(threshold: AnalyticsMilestone): {
  icon: string;
  heading: string;
} {
  const map: Record<AnalyticsMilestone, { icon: string; heading: string }> = {
    25:  { icon: "📊", heading: "25% Funded — Analytics Unlocked!" },
    50:  { icon: "🚀", heading: "Halfway — Strong Momentum!" },
    75:  { icon: "⚡", heading: "75% Funded — Final Push!" },
    100: { icon: "🎯", heading: "Goal Reached — Campaign Complete!" },
  };
  return map[threshold];
}

/**
 * @title computeFundingPercent
 * @notice Returns funding progress as a percentage (0–100), clamped.
 * @param totalRaised Current total raised.
 * @param goal        Campaign goal.
 * @returns Funding percentage in [0, 100].
 */
export function computeFundingPercent(totalRaised: number, goal: number): number {
  if (!Number.isFinite(goal) || goal <= 0) return 0;
  if (!Number.isFinite(totalRaised) || totalRaised <= 0) return 0;
  return clampAnalyticsPercent((totalRaised / goal) * 100);
}

/**
 * @title computeConversionRate
 * @notice Computes contributor conversion rate as (contributors / pageViews) * 100.
 *         Returns 0 when pageViews is zero.
 * @param contributorCount Number of unique contributors.
 * @param pageViews        Total campaign page views.
 * @returns Conversion rate percentage in [0, 100].
 */
export function computeConversionRate(
  contributorCount: number,
  pageViews: number,
): number {
  if (!Number.isFinite(pageViews) || pageViews <= 0) return 0;
  if (!Number.isFinite(contributorCount) || contributorCount <= 0) return 0;
  return clampAnalyticsPercent((contributorCount / pageViews) * 100);
}

/**
 * @title computeVelocityTrend
 * @notice Compares current vs previous daily velocity to determine trend direction.
 * @param current  Current 7-day average velocity.
 * @param previous Prior 7-day average velocity.
 * @returns "up" | "down" | "flat"
 */
export function computeVelocityTrend(
  current: number,
  previous: number,
): "up" | "down" | "flat" {
  const c = Number.isFinite(current) && current >= 0 ? current : 0;
  const p = Number.isFinite(previous) && previous >= 0 ? previous : 0;
  if (p === 0) return c > 0 ? "up" : "flat";
  const delta = (c - p) / p;
  if (delta > 0.05) return "up";
  if (delta < -0.05) return "down";
  return "flat";
}

/**
 * @title computeDaysToGoal
 * @notice Estimates days to reach the goal at the current daily velocity.
 *         Returns null when velocity is zero or goal is already met.
 * @param totalRaised   Current total raised.
 * @param goal          Campaign goal.
 * @param dailyVelocity Average tokens raised per day.
 * @returns Estimated days (ceiling), or null.
 */
export function computeDaysToGoal(
  totalRaised: number,
  goal: number,
  dailyVelocity: number,
): number | null {
  if (!Number.isFinite(totalRaised) || !Number.isFinite(goal)) return null;
  if (!Number.isFinite(dailyVelocity) || dailyVelocity <= 0) return null;
  if (totalRaised >= goal) return null;
  return Math.ceil((goal - totalRaised) / dailyVelocity);
}

/**
 * @title formatAnalyticsValue
 * @notice Formats a numeric value for KPI display.
 *         Abbreviates large numbers (1 500 000 → "1.5M", 2 500 → "2.5K").
 * @param value Numeric value.
 * @returns Formatted string, or "—" for non-finite input.
 */
export function formatAnalyticsValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

/**
 * @title deriveKpis
 * @notice Derives up to MAX_KPI_CARDS KPI metrics from campaign analytics data.
 *         Results are ordered by severity (critical first).
 *
 * @param metrics Campaign analytics metrics.
 * @returns Array of KpiMetric objects.
 *
 * @custom:security All numeric inputs are validated before use. No user
 *                  strings are interpolated into KPI bodies.
 */
export function deriveKpis(metrics: AnalyticsMetrics): KpiMetric[] {
  if (!metrics || typeof metrics !== "object") return [];

  const kpis: KpiMetric[] = [];
  const {
    totalRaised = 0,
    goal = 0,
    contributorCount = 0,
    pageViews = 0,
    daysRemaining = 0,
    dailyVelocity = 0,
    previousVelocity = 0,
    largestContrib = 0,
  } = metrics;

  const fundingPct = computeFundingPercent(totalRaised, goal);
  const conversionRate = computeConversionRate(contributorCount, pageViews);
  const velocityTrend = computeVelocityTrend(dailyVelocity, previousVelocity);
  const daysToGoal = computeDaysToGoal(totalRaised, goal, dailyVelocity);

  // 1. Funding progress
  kpis.push({
    id: "funding",
    category: "funding",
    severity: fundingPct >= 100 ? "success" : fundingPct >= 50 ? "info" : "warning",
    label: "Funding Progress",
    value: `${fundingPct.toFixed(1)}%`,
    subtext: `${formatAnalyticsValue(totalRaised)} / ${formatAnalyticsValue(goal)}`,
    trend: "flat",
  });

  // 2. Daily velocity
  if (Number.isFinite(dailyVelocity) && dailyVelocity > 0) {
    const isStrong = dailyVelocity >= STRONG_VELOCITY_THRESHOLD;
    kpis.push({
      id: "velocity",
      category: "velocity",
      severity: isStrong ? "success" : "info",
      label: "Daily Velocity",
      value: `${formatAnalyticsValue(dailyVelocity)}/day`,
      subtext: isStrong ? "Strong momentum" : "Moderate pace",
      trend: velocityTrend,
    });
  }

  // 3. Contributor count
  if (Number.isFinite(contributorCount) && contributorCount > 0) {
    kpis.push({
      id: "contributors",
      category: "engagement",
      severity: contributorCount >= HIGH_ENGAGEMENT_THRESHOLD ? "success" : "info",
      label: "Contributors",
      value: formatAnalyticsValue(contributorCount),
      subtext: contributorCount >= HIGH_ENGAGEMENT_THRESHOLD
        ? "High community engagement"
        : "Growing backer base",
    });
  }

  // 4. Conversion rate
  if (Number.isFinite(pageViews) && pageViews > 0) {
    const isHealthy = conversionRate >= HEALTHY_CONVERSION_RATE;
    kpis.push({
      id: "conversion",
      category: "conversion",
      severity: isHealthy ? "success" : "warning",
      label: "Conversion Rate",
      value: `${conversionRate.toFixed(1)}%`,
      subtext: `${formatAnalyticsValue(pageViews)} page views`,
    });
  }

  // 5. Days-to-goal projection
  if (daysToGoal !== null) {
    const onTrack = daysToGoal <= daysRemaining;
    kpis.push({
      id: "projection",
      category: "projection",
      severity: onTrack ? "success" : "warning",
      label: "Goal Projection",
      value: `~${daysToGoal}d`,
      subtext: onTrack
        ? "On track to reach goal"
        : `${daysRemaining} days remain`,
    });
  }

  // 6. Deadline urgency
  if (Number.isFinite(daysRemaining) && daysRemaining > 0 && daysRemaining <= 3 && fundingPct < 100) {
    kpis.push({
      id: "urgency",
      category: "funding",
      severity: "critical",
      label: "Deadline Alert",
      value: `${daysRemaining}d left`,
      subtext: "Urgency messaging recommended",
    });
  }

  // Sort: critical → warning → success → info, then cap at MAX_KPI_CARDS.
  const order: Record<KpiSeverity, number> = { critical: 0, warning: 1, success: 2, info: 3 };
  kpis.sort((a, b) => order[a.severity] - order[b.severity]);
  return kpis.slice(0, MAX_KPI_CARDS);
}

// ── Severity helpers ──────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<KpiSeverity, string> = {
  info:     "#3b82f6",
  success:  "#10b981",
  warning:  "#f59e0b",
  critical: "#ef4444",
};

const TREND_ICONS: Record<"up" | "down" | "flat", string> = {
  up:   "↑",
  down: "↓",
  flat: "→",
};

// ── AnalyticsCard ─────────────────────────────────────────────────────────────

/**
 * @title AnalyticsCard
 * @notice Renders a single KPI metric card with label, value, optional subtext,
 *         and an optional trend indicator.
 *
 * @custom:security No user-controlled values reach style attributes except
 *                  the severity color, which is sourced from a hardcoded map.
 */
export const AnalyticsCard: React.FC<AnalyticsCardProps> = ({
  kpi,
  "data-testid": testId,
}) => {
  const color = SEVERITY_COLORS[kpi.severity] ?? SEVERITY_COLORS.info;
  return (
    <div
      data-testid={testId ?? `kpi-card-${kpi.id}`}
      role="article"
      aria-label={`${kpi.label}: ${kpi.value}`}
      style={{
        border: `2px solid ${color}`,
        borderRadius: 8,
        padding: "1rem",
        background: "#fff",
        minWidth: 140,
        flex: "1 1 140px",
      }}
    >
      <div
        data-testid={`kpi-label-${kpi.id}`}
        style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: 4 }}
      >
        {kpi.label}
      </div>
      <div
        data-testid={`kpi-value-${kpi.id}`}
        style={{ fontSize: "1.5rem", fontWeight: 700, color }}
      >
        {kpi.value}
        {kpi.trend && (
          <span
            aria-hidden="true"
            data-testid={`kpi-trend-${kpi.id}`}
            style={{ fontSize: "1rem", marginLeft: 4 }}
          >
            {TREND_ICONS[kpi.trend]}
          </span>
        )}
      </div>
      {kpi.subtext && (
        <div
          data-testid={`kpi-subtext-${kpi.id}`}
          style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: 4 }}
        >
          {kpi.subtext}
        </div>
      )}
    </div>
  );
};

// ── AnalyticsDashboard ────────────────────────────────────────────────────────

/**
 * @title AnalyticsDashboard
 * @notice Renders a responsive grid of KPI cards with loading and empty states.
 *
 * @custom:accessibility
 *   - `role="region"` with `aria-label` for landmark navigation.
 *   - `aria-busy` set during loading state.
 */
export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  kpis,
  isLoading = false,
  campaignName,
}) => {
  const rawName = sanitizeAnalyticsString(campaignName, MAX_ANALYTICS_NAME_LENGTH);
  const label = rawName ? `${rawName} Analytics` : "Campaign Analytics";

  return (
    <section
      role="region"
      aria-label={label}
      aria-busy={isLoading}
      data-testid="analytics-dashboard"
      style={{ padding: "1rem 0" }}
    >
      <h3
        data-testid="analytics-dashboard-title"
        style={{ margin: "0 0 0.75rem", fontSize: "1rem", color: "#111827" }}
      >
        {label}
      </h3>

      {isLoading && (
        <p data-testid="analytics-loading" role="status" aria-live="polite">
          Loading analytics…
        </p>
      )}

      {!isLoading && kpis.length === 0 && (
        <p data-testid="analytics-empty" style={{ color: "#6b7280" }}>
          No analytics data available yet.
        </p>
      )}

      {!isLoading && kpis.length > 0 && (
        <div
          data-testid="analytics-kpi-grid"
          style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}
        >
          {kpis.map((kpi) => (
            <AnalyticsCard key={kpi.id} kpi={kpi} />
          ))}
        </div>
      )}
    </section>
  );
};

// ── MilestoneAnalytics ────────────────────────────────────────────────────────

/**
 * @title MilestoneAnalytics
 * @notice Main component combining a milestone celebration overlay with a live
 *         analytics dashboard. Detects newly-crossed milestones, fires the
 *         `onMilestone` callback with a structured event, and renders KPI cards
 *         derived from the supplied campaign metrics.
 *
 * @dev Renders nothing for the overlay when no uncelebrated milestone has been
 *      crossed. The dashboard is always rendered when `showDashboard` is true.
 */
const MilestoneAnalytics: React.FC<MilestoneAnalyticsProps> = ({
  currentPercent,
  metrics,
  campaignName,
  autoDismissMs = DEFAULT_ANALYTICS_DISMISS_MS,
  onMilestone,
  onDismiss,
  showDashboard = true,
  className,
}) => {
  const [celebrated, setCelebrated] = useState<Set<AnalyticsMilestone>>(
    () => new Set(),
  );
  const [active, setActive] = useState<AnalyticsMilestone | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Detect newly-crossed milestones.
  useEffect(() => {
    const clamped = clampAnalyticsPercent(currentPercent);
    const next = resolveAnalyticsMilestone(clamped, celebrated);
    if (next === null) return;

    setCelebrated((prev) => new Set([...prev, next]));
    setActive(next);

    const event: MilestoneEvent = {
      threshold: next,
      reachedAt: Date.now(),
      contributorCount: Number.isFinite(metrics?.contributorCount)
        ? Math.max(0, metrics.contributorCount)
        : 0,
      totalRaised: Number.isFinite(metrics?.totalRaised)
        ? Math.max(0, metrics.totalRaised)
        : 0,
    };
    onMilestone?.(event);

    if (autoDismissMs > 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          setActive(null);
          onDismiss?.(next);
        }
      }, autoDismissMs);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPercent]);

  const handleDismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (active !== null) onDismiss?.(active);
    setActive(null);
  }, [active, onDismiss]);

  const kpis = useMemo(() => deriveKpis(metrics), [metrics]);
  const safeName = sanitizeAnalyticsString(campaignName, MAX_ANALYTICS_NAME_LENGTH);
  const fundingPct = computeFundingPercent(
    metrics?.totalRaised ?? 0,
    metrics?.goal ?? 0,
  );

  return (
    <div
      data-testid="milestone-analytics-root"
      className={className}
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      {/* ── Celebration overlay ── */}
      {active !== null && (() => {
        const { icon, heading } = getMilestoneAnalyticsContent(active);
        return (
          <div
            role="status"
            aria-live="polite"
            aria-label={heading}
            data-testid="analytics-overlay"
            style={{
              position: "fixed",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.55)",
              zIndex: 1000,
            }}
          >
            <div
              data-testid="analytics-overlay-card"
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: "2rem",
                textAlign: "center",
                maxWidth: 420,
                width: "90%",
              }}
            >
              <span aria-hidden="true" style={{ fontSize: "3rem" }}>{icon}</span>
              <h2 data-testid="analytics-overlay-heading" style={{ margin: "0.5rem 0" }}>
                {heading}
              </h2>
              {safeName && (
                <p data-testid="analytics-overlay-campaign">{safeName}</p>
              )}
              <p data-testid="analytics-overlay-threshold">
                {active}% milestone reached
              </p>

              {/* Inline funding progress bar */}
              <div
                role="progressbar"
                aria-valuenow={fundingPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Funding progress"
                data-testid="analytics-overlay-progress"
                style={{
                  background: "#e5e7eb",
                  borderRadius: 4,
                  height: 8,
                  margin: "1rem 0",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${fundingPct}%`,
                    height: "100%",
                    background: "#10b981",
                    borderRadius: 4,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>

              <button
                onClick={handleDismiss}
                aria-label="Dismiss milestone celebration"
                data-testid="analytics-dismiss-button"
                style={{
                  marginTop: "0.5rem",
                  padding: "0.6rem 1.5rem",
                  background: "#111827",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  minWidth: 44,
                  minHeight: 44,
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Analytics dashboard ── */}
      {showDashboard && (
        <AnalyticsDashboard
          kpis={kpis}
          campaignName={campaignName}
        />
      )}
    </div>
  );
};

export default MilestoneAnalytics;
