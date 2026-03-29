import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * @title MilestoneDashboard
 * @notice Campaign milestone celebration dashboard for the Stellar Raise
 *         crowdfunding dApp. Combines a dismissible celebration overlay with
 *         a management interface showing live campaign KPIs, milestone
 *         progress, and a contributor leaderboard.
 *
 * @dev Security assumptions:
 *   - No dangerouslySetInnerHTML — all content rendered as React text nodes.
 *   - All user-supplied strings pass through sanitizeDashboardString before render.
 *   - currentPercent is clamped to [0, 100] before any comparison.
 *   - Auto-dismiss timer is cleared on unmount to prevent memory leaks.
 *   - onMilestone / onDismiss callbacks are guarded against post-unmount calls.
 *   - All numeric inputs are validated with Number.isFinite before use.
 *   - Severity colour values are sourced from a hardcoded map — no user CSS.
 *
 * @custom:accessibility
 *   - role="region" with aria-label on the dashboard for landmark navigation.
 *   - role="status" + aria-live="polite" on the celebration overlay.
 *   - role="progressbar" with aria-valuenow/min/max on the funding bar.
 *   - Dismiss button has aria-label for assistive technology.
 *   - Decorative icons carry aria-hidden="true".
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Supported milestone thresholds as percentages. */
export const DASHBOARD_MILESTONES = [25, 50, 75, 100] as const;
export type DashboardMilestone = (typeof DASHBOARD_MILESTONES)[number];

/** Default auto-dismiss delay in milliseconds. */
export const DEFAULT_DISMISS_MS = 5_000;

/** Maximum characters for campaign name display. */
export const MAX_NAME_LENGTH = 80;

/** Maximum characters for a contributor name. */
export const MAX_CONTRIBUTOR_NAME_LENGTH = 50;

/** Maximum number of leaderboard entries rendered. */
export const MAX_LEADERBOARD_ENTRIES = 10;

/** Tokens/day threshold for "strong" velocity badge. */
export const STRONG_VELOCITY_THRESHOLD = 1_000;

/** Contributor count threshold for "high engagement" badge. */
export const HIGH_ENGAGEMENT_THRESHOLD = 10;

/** Days-remaining threshold for "urgent" deadline badge. */
export const URGENT_DAYS_THRESHOLD = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Severity level for KPI cards. */
export type KpiSeverity = "info" | "success" | "warning" | "critical";

/** A single contributor entry for the leaderboard. */
export interface ContributorEntry {
  /** Opaque contributor identifier (not rendered directly). */
  id: string;
  /** Display name — sanitized before render. */
  name: string;
  /** Contribution amount in token units. */
  amount: number;
}

/** Campaign metrics consumed by the dashboard. */
export interface DashboardMetrics {
  /** Tokens raised so far. */
  totalRaised: number;
  /** Campaign funding goal. */
  goal: number;
  /** Unique contributor count. */
  contributorCount: number;
  /** Total campaign page views. */
  pageViews: number;
  /** Days remaining until deadline. */
  daysRemaining: number;
  /** Average tokens/day over the last 7 days. */
  dailyVelocity: number;
  /** Average tokens/day over the prior 7-day window (for trend). */
  previousVelocity: number;
  /** Top contributors for the leaderboard (max MAX_LEADERBOARD_ENTRIES). */
  topContributors: ContributorEntry[];
}

/** Structured event emitted when a milestone is reached. */
export interface MilestoneEvent {
  threshold: DashboardMilestone;
  campaignName: string;
  timestamp: number;
}

/** A single KPI card data object. */
export interface KpiCard {
  id: string;
  label: string;
  value: string;
  subtext?: string;
  severity: KpiSeverity;
  trend?: "up" | "down" | "flat";
}

/** Props for the MilestoneDashboard component. */
export interface MilestoneDashboardProps {
  /** Current funding percentage (0–100). Clamped internally. */
  currentPercent: number;
  /** Campaign metrics for KPI derivation. */
  metrics: DashboardMetrics;
  /** Optional campaign name shown in overlay and dashboard header. */
  campaignName?: string;
  /** Auto-dismiss delay in ms. 0 disables auto-dismiss. Default: 5000. */
  autoDismissMs?: number;
  /** Called when a milestone is reached. */
  onMilestone?: (event: MilestoneEvent) => void;
  /** Called when the overlay is dismissed. */
  onDismiss?: (threshold: DashboardMilestone) => void;
  /** Whether to render the KPI dashboard below the overlay. Default: true. */
  showDashboard?: boolean;
  /** Additional CSS class for the root element. */
  className?: string;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * @notice Clamps a numeric progress value to [0, 100].
 * @param value Raw progress percentage.
 * @returns Clamped value, or 0 for non-finite input.
 */
export function clampDashboardPercent(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * @notice Sanitizes a user-supplied string for safe display.
 *   - Rejects non-strings.
 *   - Strips control characters (U+0000–U+001F, U+007F).
 *   - Collapses whitespace.
 *   - Truncates to maxLength.
 * @param input     Raw string.
 * @param maxLength Maximum allowed length.
 * @returns Sanitized string, or "" on invalid input.
 */
export function sanitizeDashboardString(input: unknown, maxLength: number): string {
  if (typeof input !== "string") return "";
  const cleaned = input
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, maxLength);
}

/**
 * @notice Resolves the next uncelebrated milestone crossed by currentPercent.
 * @param currentPercent  Clamped progress percentage.
 * @param celebrated      Set of already-celebrated threshold values.
 * @returns The lowest uncelebrated threshold crossed, or null.
 */
export function resolveNextDashboardMilestone(
  currentPercent: number,
  celebrated: ReadonlySet<DashboardMilestone>
): DashboardMilestone | null {
  for (const t of DASHBOARD_MILESTONES) {
    if (currentPercent >= t && !celebrated.has(t)) return t;
  }
  return null;
}

/**
 * @notice Returns the emoji icon and heading for a given milestone threshold.
 * @param threshold Milestone threshold.
 * @returns Object with icon and heading strings.
 */
export function getMilestoneDashboardContent(threshold: DashboardMilestone): {
  icon: string;
  heading: string;
} {
  const map: Record<DashboardMilestone, { icon: string; heading: string }> = {
    25:  { icon: "🌱", heading: "25% Funded!" },
    50:  { icon: "🚀", heading: "Halfway There!" },
    75:  { icon: "⚡", heading: "75% Funded!" },
    100: { icon: "🎉", heading: "Goal Reached!" },
  };
  return map[threshold];
}

/**
 * @notice Computes funding progress as a clamped percentage.
 * @param totalRaised Tokens raised so far.
 * @param goal        Campaign funding goal.
 * @returns Funding percentage in [0, 100].
 */
export function computeDashboardFundingPercent(
  totalRaised: number,
  goal: number
): number {
  if (!Number.isFinite(totalRaised) || !Number.isFinite(goal) || goal <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (totalRaised / goal) * 100));
}

/**
 * @notice Computes velocity trend direction.
 * @param current  Current period velocity.
 * @param previous Previous period velocity.
 * @returns "up" | "down" | "flat".
 */
export function computeVelocityTrend(
  current: number,
  previous: number
): "up" | "down" | "flat" {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return "flat";
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

/**
 * @notice Abbreviates large numbers for compact display.
 * @param value Non-negative number.
 * @returns Abbreviated string (e.g. "1.2k", "3.4M"), or "—" for non-finite.
 */
export function formatDashboardValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const v = Math.max(0, value);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

/**
 * @notice Derives KPI cards from campaign metrics.
 * @param metrics DashboardMetrics input.
 * @param currentPercent Clamped funding percentage.
 * @returns Array of KpiCard objects sorted by severity (critical first).
 */
export function deriveKpiCards(
  metrics: DashboardMetrics,
  currentPercent: number
): KpiCard[] {
  const cards: KpiCard[] = [];
  const pct = clampDashboardPercent(currentPercent);

  // Funding progress
  cards.push({
    id: "funding",
    label: "Funding Progress",
    value: `${pct.toFixed(1)}%`,
    subtext: `${formatDashboardValue(metrics.totalRaised)} / ${formatDashboardValue(metrics.goal)}`,
    severity: pct >= 100 ? "success" : pct >= 50 ? "info" : "warning",
  });

  // Daily velocity
  const trend = computeVelocityTrend(metrics.dailyVelocity, metrics.previousVelocity);
  cards.push({
    id: "velocity",
    label: "Daily Velocity",
    value: `${formatDashboardValue(metrics.dailyVelocity)}/day`,
    severity: metrics.dailyVelocity >= STRONG_VELOCITY_THRESHOLD ? "success" : "info",
    trend,
  });

  // Contributors
  cards.push({
    id: "contributors",
    label: "Contributors",
    value: `${Math.max(0, Math.floor(metrics.contributorCount))}`,
    severity: metrics.contributorCount >= HIGH_ENGAGEMENT_THRESHOLD ? "success" : "info",
  });

  // Deadline
  const days = Number.isFinite(metrics.daysRemaining)
    ? Math.max(0, Math.floor(metrics.daysRemaining))
    : 0;
  const isUrgent = days <= URGENT_DAYS_THRESHOLD && pct < 100;
  cards.push({
    id: "deadline",
    label: "Days Remaining",
    value: `${days}d`,
    severity: isUrgent ? "critical" : "info",
  });

  // Sort: critical → warning → info → success
  const order: Record<KpiSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
    success: 3,
  };
  return cards.sort((a, b) => order[a.severity] - order[b.severity]);
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface KpiCardProps {
  card: KpiCard;
}

/**
 * @notice Renders a single KPI card.
 * @dev Severity colours are sourced from a hardcoded map — no user CSS.
 */
const KpiCardView: React.FC<KpiCardProps> = ({ card }) => {
  const borderMap: Record<KpiSeverity, string> = {
    info: "#3b82f6",
    success: "#22c55e",
    warning: "#f59e0b",
    critical: "#ef4444",
  };
  const trendIcon =
    card.trend === "up" ? "↑" : card.trend === "down" ? "↓" : undefined;

  return (
    <div
      data-testid={`kpi-card-${card.id}`}
      style={{
        border: `2px solid ${borderMap[card.severity]}`,
        borderRadius: 8,
        padding: "1rem",
        minWidth: 140,
      }}
    >
      <div
        data-testid={`kpi-label-${card.id}`}
        style={{ fontSize: "0.75rem", color: "#6b7280" }}
      >
        {card.label}
      </div>
      <div
        data-testid={`kpi-value-${card.id}`}
        style={{ fontSize: "1.5rem", fontWeight: 700 }}
      >
        {card.value}
        {trendIcon && (
          <span
            aria-hidden="true"
            data-testid={`kpi-trend-${card.id}`}
            style={{ fontSize: "1rem", marginLeft: 4 }}
          >
            {trendIcon}
          </span>
        )}
      </div>
      {card.subtext && (
        <div
          data-testid={`kpi-subtext-${card.id}`}
          style={{ fontSize: "0.75rem", color: "#9ca3af" }}
        >
          {card.subtext}
        </div>
      )}
    </div>
  );
};

interface LeaderboardProps {
  contributors: ContributorEntry[];
}

/**
 * @notice Renders the top-contributor leaderboard.
 * @dev Contributor names are sanitized before render.
 */
const ContributorLeaderboard: React.FC<LeaderboardProps> = ({ contributors }) => {
  const entries = contributors.slice(0, MAX_LEADERBOARD_ENTRIES);

  if (entries.length === 0) {
    return (
      <p data-testid="leaderboard-empty" style={{ color: "#9ca3af" }}>
        No contributors yet.
      </p>
    );
  }

  return (
    <ol data-testid="leaderboard-list" style={{ paddingLeft: "1.25rem" }}>
      {entries.map((c, i) => {
        const safeName = sanitizeDashboardString(c.name, MAX_CONTRIBUTOR_NAME_LENGTH);
        return (
          <li key={c.id} data-testid={`leaderboard-entry-${i}`}>
            <span data-testid={`leaderboard-name-${i}`}>{safeName || "Anonymous"}</span>
            {" — "}
            <span data-testid={`leaderboard-amount-${i}`}>
              {formatDashboardValue(c.amount)}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

/**
 * @notice Campaign milestone celebration dashboard.
 * @dev Renders a celebration overlay when a new milestone is crossed, and
 *      a management dashboard with KPI cards and contributor leaderboard.
 */
const MilestoneDashboard: React.FC<MilestoneDashboardProps> = ({
  currentPercent,
  metrics,
  campaignName,
  autoDismissMs = DEFAULT_DISMISS_MS,
  onMilestone,
  onDismiss,
  showDashboard = true,
  className,
}) => {
  const [celebrated, setCelebrated] = useState<Set<DashboardMilestone>>(
    () => new Set()
  );
  const [active, setActive] = useState<DashboardMilestone | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const clamped = clampDashboardPercent(currentPercent);
    const next = resolveNextDashboardMilestone(clamped, celebrated);
    if (next === null) return;

    setCelebrated((prev) => new Set([...prev, next]));
    setActive(next);

    const safeName = sanitizeDashboardString(campaignName, MAX_NAME_LENGTH);
    onMilestone?.({ threshold: next, campaignName: safeName, timestamp: Date.now() });

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

  const clamped = clampDashboardPercent(currentPercent);
  const kpiCards = useMemo(
    () => deriveKpiCards(metrics, clamped),
    [metrics, clamped]
  );
  const safeCampaignName = sanitizeDashboardString(campaignName, MAX_NAME_LENGTH);

  const rootClass = ["milestone-dashboard", className].filter(Boolean).join(" ");

  return (
    <div className={rootClass} data-testid="milestone-dashboard">
      {/* ── Celebration overlay ── */}
      {active !== null && (() => {
        const { icon, heading } = getMilestoneDashboardContent(active);
        return (
          <div
            role="status"
            aria-live="polite"
            data-testid="dashboard-overlay"
            style={{
              position: "fixed",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.5)",
              zIndex: 1000,
            }}
          >
            <div
              data-testid="dashboard-overlay-card"
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: "2rem",
                textAlign: "center",
                maxWidth: 420,
              }}
            >
              <span aria-hidden="true" style={{ fontSize: "3rem" }}>
                {icon}
              </span>
              <h2 data-testid="overlay-heading">{heading}</h2>
              {safeCampaignName && (
                <p data-testid="overlay-campaign">{safeCampaignName}</p>
              )}
              <p data-testid="overlay-threshold">{active}% milestone reached</p>
              <button
                onClick={handleDismiss}
                aria-label="Dismiss milestone celebration"
                data-testid="overlay-dismiss"
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Management dashboard ── */}
      {showDashboard && (
        <section
          role="region"
          aria-label="Campaign milestone dashboard"
          data-testid="dashboard-panel"
          style={{ padding: "1.5rem" }}
        >
          {safeCampaignName && (
            <h1 data-testid="dashboard-title" style={{ marginBottom: "1rem" }}>
              {safeCampaignName}
            </h1>
          )}

          {/* Funding progress bar */}
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(clamped)}
            aria-label={`Funding progress ${clamped.toFixed(1)} percent`}
            data-testid="dashboard-progress-bar"
            style={{
              height: 12,
              background: "#e5e7eb",
              borderRadius: 6,
              overflow: "hidden",
              marginBottom: "1.5rem",
            }}
          >
            <div
              data-testid="dashboard-progress-fill"
              style={{
                height: "100%",
                width: `${Math.min(100, clamped)}%`,
                background: clamped >= 100 ? "#22c55e" : "#3b82f6",
                transition: "width 0.3s ease",
              }}
            />
          </div>

          {/* KPI cards */}
          <div
            data-testid="kpi-grid"
            style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}
          >
            {kpiCards.map((card) => (
              <KpiCardView key={card.id} card={card} />
            ))}
          </div>

          {/* Contributor leaderboard */}
          <section aria-label="Top contributors" data-testid="leaderboard-section">
            <h2 style={{ marginBottom: "0.5rem" }}>Top Contributors</h2>
            <ContributorLeaderboard contributors={metrics.topContributors} />
          </section>
        </section>
      )}
    </div>
  );
};

export { KpiCardView, ContributorLeaderboard };
export default MilestoneDashboard;
