import React, { useMemo } from "react";

/**
 * @title AchievementBadges
 * @notice Displays gamified achievement badges for campaign milestones.
 *         Tracks unlocked badges, renders them in configurable layouts,
 *         and fires callbacks when new badges are earned.
 *
 * @dev Security assumptions:
 *   - No dangerouslySetInnerHTML — all content rendered as React text nodes.
 *   - Badge icons are from a hardcoded set; no user-supplied URLs.
 *   - All numeric values are clamped to safe ranges.
 *   - Custom badge data is sanitized before render.
 *
 * @custom:accessibility
 *   - role="region" with aria-label for the badge section.
 *   - Each badge has aria-label describing its unlock status.
 *   - Decorative icons carry aria-hidden="true".
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Badge {
  id: string;
  /** Funding percentage required to unlock (0–100). */
  percent: number;
  title: string;
  description: string;
  /** Emoji icon from hardcoded set. */
  icon: string;
  unlocked: boolean;
  unlockedAt?: number;
}

export interface AchievementBadgesProps {
  /** Current funding percentage (0–100). Clamped internally. */
  currentPercent: number;
  /** Display layout. Default: "grid". */
  layout?: "grid" | "list" | "compact";
  /** Show badge descriptions. Default: true. */
  showDescriptions?: boolean;
  /** Show unlock timestamps. Default: false. */
  showTimestamps?: boolean;
  /** Called when a badge is newly unlocked. */
  onBadgeUnlocked?: (badge: Badge) => void;
  /** Override default badge set. */
  customBadges?: Badge[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_BADGES: Badge[] = [
  { id: "launch",    percent: 0,   title: "Launched",       description: "Campaign is live",                icon: "🚀", unlocked: true  },
  { id: "quarter",   percent: 25,  title: "First Quarter",  description: "Reached 25% of funding goal",     icon: "🥉", unlocked: false },
  { id: "halfway",   percent: 50,  title: "Halfway Hero",   description: "Reached 50% of funding goal",     icon: "🥈", unlocked: false },
  { id: "threequarter", percent: 75, title: "Almost Gold",  description: "Reached 75% of funding goal",     icon: "🏅", unlocked: false },
  { id: "complete",  percent: 100, title: "Gold Backer",    description: "Campaign fully funded",            icon: "🥇", unlocked: false },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampValue(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function sanitizeBadge(b: Badge): Badge {
  return {
    ...b,
    percent: clampValue(Math.floor(b.percent), 0, 100),
    title: String(b.title).slice(0, 100),
    description: String(b.description).slice(0, 500),
    icon: String(b.icon).slice(0, 2),
  };
}

function applyUnlockStatus(badges: Badge[], currentPercent: number): Badge[] {
  return badges.map((b) => ({ ...b, unlocked: currentPercent >= b.percent }));
}

function badgeProgress(badges: Badge[]): number {
  if (badges.length === 0) return 0;
  return Math.round((badges.filter((b) => b.unlocked).length / badges.length) * 100);
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * @notice Achievement badge display component.
 */
const AchievementBadges: React.FC<AchievementBadgesProps> = ({
  currentPercent,
  layout = "grid",
  showDescriptions = true,
  showTimestamps = false,
  onBadgeUnlocked,
  customBadges,
}) => {
  const clamped = clampValue(currentPercent, 0, 100);
  const base = customBadges ?? DEFAULT_BADGES;
  const sanitized = useMemo(() => base.map(sanitizeBadge), [base]);
  const badges = useMemo(() => applyUnlockStatus(sanitized, clamped), [sanitized, clamped]);
  const progress = useMemo(() => badgeProgress(badges), [badges]);

  const prevUnlocked = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    badges.forEach((b) => {
      if (b.unlocked && !prevUnlocked.current.has(b.id)) {
        prevUnlocked.current.add(b.id);
        onBadgeUnlocked?.({ ...b, unlockedAt: Date.now() });
      }
    });
  }, [badges, onBadgeUnlocked]);

  const regionId = `badges-${Math.random().toString(36).slice(2, 9)}`;

  if (layout === "list") {
    return (
      <div className="achievement-badges-list" role="region" aria-label="Campaign achievement badges" id={regionId}>
        <div className="badges-header">
          <h3>Badges</h3>
          <span className="badges-count" aria-live="polite">
            {badges.filter((b) => b.unlocked).length} of {badges.length} unlocked
          </span>
        </div>
        <ul className="badges-list">
          {badges.map((b) => (
            <li key={b.id} className={`badge-item ${b.unlocked ? "unlocked" : "locked"}`}
              aria-label={`${b.title} — ${b.unlocked ? "Unlocked" : "Locked"}`}>
              <span className="badge-icon" aria-hidden="true">{b.icon}</span>
              <div className="badge-content">
                <h4 className="badge-title">{b.title}</h4>
                {showDescriptions && <p className="badge-description">{b.description}</p>}
              </div>
              <span className="badge-percent">{b.percent}%</span>
              {b.unlocked && <span className="badge-check" aria-hidden="true">✓</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (layout === "compact") {
    return (
      <div className="achievement-badges-compact" role="region" aria-label="Campaign achievement badges" id={regionId}>
        <h4 className="badges-compact-header">Badges: {progress}%</h4>
        <div className="badges-compact-list">
          {badges.map((b) => (
            <div key={b.id} className={`badge-compact ${b.unlocked ? "unlocked" : "locked"}`}
              title={b.title} aria-label={`${b.title} — ${b.unlocked ? "Unlocked" : "Locked"}`}>
              <span className="badge-icon" aria-hidden="true">{b.icon}</span>
              {b.unlocked && <span className="badge-check" aria-hidden="true">✓</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Default: grid
  return (
    <div className="achievement-badges-grid" role="region" aria-label="Campaign achievement badges" id={regionId}>
      <div className="badges-header">
        <h3>Achievement Badges</h3>
        <div className="badges-progress">
          <span className="progress-text">{progress}% Unlocked</span>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
      <div className="badges-grid">
        {badges.map((b) => (
          <div key={b.id} className={`badge-card ${b.unlocked ? "unlocked" : "locked"}`}
            role="article" aria-label={`${b.title} — ${b.unlocked ? "Unlocked" : "Locked"}`}>
            <div className="badge-icon" aria-hidden="true">{b.icon}</div>
            <div className="badge-content">
              <h4 className="badge-title">{b.title}</h4>
              {showDescriptions && <p className="badge-description">{b.description}</p>}
              <div className="badge-meta">
                <span className="badge-percent">{b.percent}%</span>
                {b.unlocked && showTimestamps && b.unlockedAt && (
                  <span className="badge-timestamp">{new Date(b.unlockedAt).toLocaleString()}</span>
                )}
              </div>
            </div>
            {b.unlocked && <div className="badge-check" aria-hidden="true">✓</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AchievementBadges;
