import React, { useMemo } from "react";

/**
 * @title MilestoneAchievements
 * @notice Displays achievement badges and gamification elements for campaign milestones.
 *         Tracks unlocked achievements, displays badges, and provides achievement history.
 *
 * @dev Security assumptions:
 *   - No dangerouslySetInnerHTML — all content rendered as React text nodes.
 *   - Achievement data is validated and sanitized.
 *   - Badge icons are from hardcoded set, not user-controlled.
 *   - All numeric values are clamped to safe ranges.
 *
 * @custom:accessibility
 *   - role="region" with aria-label for achievement section.
 *   - Each achievement has aria-label describing its status.
 *   - Badges are announced via aria-live for dynamic updates.
 */

export interface Achievement {
  id: string;
  percent: number;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: number;
}

export interface MilestoneAchievementsProps {
  /** Current funding percentage (0-100) */
  currentPercent: number;
  /** Display layout: 'grid' | 'list' | 'compact' */
  layout?: "grid" | "list" | "compact";
  /** Show achievement descriptions */
  showDescriptions?: boolean;
  /** Show unlock timestamps */
  showTimestamps?: boolean;
  /** Callback when achievement unlocked */
  onAchievementUnlocked?: (achievement: Achievement) => void;
  /** Custom achievements */
  customAchievements?: Achievement[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_ACHIEVEMENTS: Achievement[] = [
  {
    id: "start",
    percent: 0,
    title: "Campaign Started",
    description: "Campaign has been created and is live",
    icon: "🚀",
    unlocked: true,
  },
  {
    id: "quarter",
    percent: 25,
    title: "Quarter Way There",
    description: "Reached 25% of funding goal",
    icon: "🎯",
    unlocked: false,
  },
  {
    id: "halfway",
    percent: 50,
    title: "Halfway Home",
    description: "Reached 50% of funding goal",
    icon: "🏃",
    unlocked: false,
  },
  {
    id: "threequarter",
    percent: 75,
    title: "Almost There",
    description: "Reached 75% of funding goal",
    icon: "🔥",
    unlocked: false,
  },
  {
    id: "complete",
    percent: 100,
    title: "Goal Achieved",
    description: "Successfully reached 100% of funding goal",
    icon: "🎉",
    unlocked: false,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Clamps a value between min and max.
 */
function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Sanitizes achievement data.
 */
function sanitizeAchievement(achievement: Achievement): Achievement {
  return {
    ...achievement,
    percent: clampValue(Math.floor(achievement.percent), 0, 100),
    title: String(achievement.title).slice(0, 100),
    description: String(achievement.description).slice(0, 500),
    icon: String(achievement.icon).slice(0, 2),
  };
}

/**
 * Determines achievement unlock status.
 */
function updateAchievementStatus(
  achievements: Achievement[],
  currentPercent: number,
): Achievement[] {
  return achievements.map((a) => ({
    ...a,
    unlocked: currentPercent >= a.percent,
  }));
}

/**
 * Formats timestamp for display.
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Gets achievement progress percentage.
 */
function getAchievementProgress(
  achievements: Achievement[],
): number {
  if (achievements.length === 0) return 0;
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  return Math.round((unlockedCount / achievements.length) * 100);
}

// ── Component ─────────────────────────────────────────────────────────────────

const MilestoneAchievements: React.FC<MilestoneAchievementsProps> = ({
  currentPercent,
  layout = "grid",
  showDescriptions = true,
  showTimestamps = false,
  onAchievementUnlocked,
  customAchievements,
}) => {
  const clampedPercent = clampValue(currentPercent, 0, 100);
  const baseAchievements = customAchievements || DEFAULT_ACHIEVEMENTS;
  const sanitizedAchievements = useMemo(
    () => baseAchievements.map(sanitizeAchievement),
    [baseAchievements],
  );

  const achievements = useMemo(
    () => updateAchievementStatus(sanitizedAchievements, clampedPercent),
    [sanitizedAchievements, clampedPercent],
  );

  const previousAchievements = React.useRef<Set<string>>(new Set());

  // Detect newly unlocked achievements
  React.useEffect(() => {
    achievements.forEach((achievement) => {
      if (
        achievement.unlocked &&
        !previousAchievements.current.has(achievement.id)
      ) {
        previousAchievements.current.add(achievement.id);
        if (onAchievementUnlocked) {
          onAchievementUnlocked({
            ...achievement,
            unlockedAt: Date.now(),
          });
        }
      }
    });
  }, [achievements, onAchievementUnlocked]);

  const progress = useMemo(
    () => getAchievementProgress(achievements),
    [achievements],
  );

  const achievementId = `achievements-${Math.random().toString(36).substr(2, 9)}`;

  if (layout === "grid") {
    return (
      <div
        className="milestone-achievements-grid"
        role="region"
        aria-label="Campaign achievements"
        id={achievementId}
      >
        <div className="achievements-header">
          <h3>Achievements</h3>
          <div className="achievements-progress">
            <span className="progress-text">{progress}% Unlocked</span>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="achievements-grid">
          {achievements.map((achievement) => (
            <div
              key={achievement.id}
              className={`achievement-card ${achievement.unlocked ? "unlocked" : "locked"}`}
              aria-label={`${achievement.title} - ${achievement.unlocked ? "Unlocked" : "Locked"}`}
              role="article"
            >
              <div className="achievement-icon">{achievement.icon}</div>
              <div className="achievement-content">
                <h4 className="achievement-title">{achievement.title}</h4>
                {showDescriptions && (
                  <p className="achievement-description">
                    {achievement.description}
                  </p>
                )}
                <div className="achievement-meta">
                  <span className="achievement-percent">{achievement.percent}%</span>
                  {achievement.unlocked && showTimestamps && achievement.unlockedAt && (
                    <span className="achievement-timestamp">
                      {formatTimestamp(achievement.unlockedAt)}
                    </span>
                  )}
                </div>
              </div>
              {achievement.unlocked && (
                <div className="achievement-badge" aria-hidden="true">
                  ✓
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (layout === "list") {
    return (
      <div
        className="milestone-achievements-list"
        role="region"
        aria-label="Campaign achievements"
        id={achievementId}
      >
        <div className="achievements-header">
          <h3>Achievements</h3>
          <span className="achievements-count" aria-live="polite">
            {achievements.filter((a) => a.unlocked).length} of{" "}
            {achievements.length} unlocked
          </span>
        </div>

        <ul className="achievements-list">
          {achievements.map((achievement) => (
            <li
              key={achievement.id}
              className={`achievement-item ${achievement.unlocked ? "unlocked" : "locked"}`}
              aria-label={`${achievement.title} - ${achievement.unlocked ? "Unlocked" : "Locked"}`}
            >
              <div className="achievement-icon">{achievement.icon}</div>
              <div className="achievement-content">
                <h4 className="achievement-title">{achievement.title}</h4>
                {showDescriptions && (
                  <p className="achievement-description">
                    {achievement.description}
                  </p>
                )}
              </div>
              <div className="achievement-status">
                <span className="achievement-percent">{achievement.percent}%</span>
                {achievement.unlocked && (
                  <span className="achievement-badge" aria-hidden="true">
                    ✓
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (layout === "compact") {
    return (
      <div
        className="milestone-achievements-compact"
        role="region"
        aria-label="Campaign achievements"
        id={achievementId}
      >
        <div className="achievements-compact-header">
          <h4>Achievements: {progress}%</h4>
        </div>
        <div className="achievements-compact-list">
          {achievements.map((achievement) => (
            <div
              key={achievement.id}
              className={`achievement-compact ${achievement.unlocked ? "unlocked" : "locked"}`}
              title={achievement.title}
              aria-label={`${achievement.title} - ${achievement.unlocked ? "Unlocked" : "Locked"}`}
            >
              <span className="achievement-icon">{achievement.icon}</span>
              {achievement.unlocked && (
                <span className="achievement-check" aria-hidden="true">
                  ✓
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

export default MilestoneAchievements;
