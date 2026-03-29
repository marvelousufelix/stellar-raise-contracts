import React, { useMemo } from "react";

/**
 * @title MilestoneHighlights
 * @notice Displays campaign milestone achievements with visual highlights,
 *         progress indicators, and achievement badges for frontend UI.
 *
 * @dev Security assumptions:
 *   - No dangerouslySetInnerHTML — all content rendered as React text nodes.
 *   - All user-supplied strings are sanitized before render.
 *   - Progress values are clamped to [0, 100] to prevent layout abuse.
 *   - All numeric inputs are validated and bounded.
 *
 * @custom:accessibility
 *   - Semantic HTML with proper ARIA labels.
 *   - Progress bars use aria-valuenow, aria-valuemin, aria-valuemax.
 *   - Achievement badges have descriptive labels.
 */

export interface Milestone {
  id: string;
  label: string;
  percentage: number;
  achieved: boolean;
  achievedAt?: Date;
}

export interface MilestoneHighlightsProps {
  campaignName: string;
  currentProgress: number;
  milestones: Milestone[];
  onMilestoneClick?: (milestone: Milestone) => void;
}

/**
 * Sanitizes user-supplied strings to prevent XSS.
 */
export const sanitizeMilestoneLabel = (label: string): string => {
  if (typeof label !== "string") return "";
  return label
    .replace(/[<>]/g, "")
    .substring(0, 100);
};

/**
 * Clamps progress value to [0, 100].
 */
export const clampMilestoneProgress = (value: number): number => {
  const num = Number(value);
  return Math.max(0, Math.min(100, isNaN(num) ? 0 : num));
};

/**
 * Determines if a milestone is achieved based on current progress.
 */
export const isMilestoneAchieved = (
  currentProgress: number,
  milestonePercentage: number
): boolean => {
  return clampMilestoneProgress(currentProgress) >= clampMilestoneProgress(milestonePercentage);
};

/**
 * Generates achievement badge content.
 */
export const getAchievementBadge = (milestone: Milestone): string => {
  if (!milestone.achieved) return "Locked";
  return milestone.achievedAt
    ? `Achieved ${milestone.achievedAt.toLocaleDateString()}`
    : "Achieved";
};

/**
 * MilestoneHighlights Component
 */
const MilestoneHighlights: React.FC<MilestoneHighlightsProps> = ({
  campaignName,
  currentProgress,
  milestones,
  onMilestoneClick,
}) => {
  const sanitizedName = useMemo(
    () => sanitizeMilestoneLabel(campaignName),
    [campaignName]
  );

  const clampedProgress = useMemo(
    () => clampMilestoneProgress(currentProgress),
    [currentProgress]
  );

  const enrichedMilestones = useMemo(
    () =>
      milestones.map((m) => ({
        ...m,
        achieved: isMilestoneAchieved(clampedProgress, m.percentage),
      })),
    [milestones, clampedProgress]
  );

  return (
    <div className="milestone-highlights" role="region" aria-label="Campaign milestones">
      <h2 className="milestone-highlights__title">
        {sanitizedName} - Milestone Progress
      </h2>

      <div className="milestone-highlights__progress-bar">
        <div
          className="milestone-highlights__progress-fill"
          style={{ width: `${clampedProgress}%` }}
          role="progressbar"
          aria-valuenow={clampedProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Campaign progress: ${clampedProgress}%`}
        />
      </div>

      <div className="milestone-highlights__milestones">
        {enrichedMilestones.map((milestone) => (
          <div
            key={milestone.id}
            className={`milestone-highlights__item ${
              milestone.achieved ? "milestone-highlights__item--achieved" : ""
            }`}
            onClick={() => onMilestoneClick?.(milestone)}
            role="button"
            tabIndex={0}
            aria-pressed={milestone.achieved}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                onMilestoneClick?.(milestone);
              }
            }}
          >
            <div className="milestone-highlights__marker">
              {milestone.percentage}%
            </div>
            <div className="milestone-highlights__label">
              {sanitizeMilestoneLabel(milestone.label)}
            </div>
            <div className="milestone-highlights__badge">
              {getAchievementBadge(milestone)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MilestoneHighlights;
