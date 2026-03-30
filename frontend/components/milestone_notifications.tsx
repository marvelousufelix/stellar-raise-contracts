/**
 * @title MilestoneNotifications — Milestone push engagement toolkit.
 * @notice Calculates milestone status and renders approachable CTA cards for the UI.
 * @dev Should be integrated into the campaign dashboard with live progress updates.
 */
import React from "react";

export type MilestoneNotification = {
  id: string;
  title: string;
  targetPercent: number;
  reached: boolean;
  reachedAt?: Date;
};

export type MilestoneNotificationsProps = {
  campaignName: string;
  currentProgress: number;
  milestones: MilestoneNotification[];
  onMilestoneClick?: (milestoneId: string) => void;
};

/**
 * @notice Ensure progress is bounded between 0 and 100.
 * @param value Progress value.
 * @return Clamped progress value.
 */
export function clampProgress(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Number(value)));
}

/**
 * @notice Sanitizes milestone label to prevent XSS from injected text.
 * @dev This is a low-level HTML removal, not a full sanitizer library.
 */
export function sanitizeLabel(label: string): string {
  return String(label)
    .replace(/</g, "")
    .replace(/>/g, "")
    .slice(0, 100);
}

/**
 * @notice Returns milestones not yet reached but within the next 30 percentage points.
 */
export function getUpcomingMilestones(
  milestones: MilestoneNotification[],
  currentProgress: number
): MilestoneNotification[] {
  const progress = clampProgress(currentProgress);
  return milestones
    .filter((m) => !m.reached && m.targetPercent > progress)
    .sort((a, b) => a.targetPercent - b.targetPercent)
    .slice(0, 3);
}

/**
 * @notice Build a safe payload for display.
 */
function buildMilestoneDescription(m: MilestoneNotification): string {
  const label = sanitizeLabel(m.title);
  if (m.reached && m.reachedAt) {
    return `${label} reached on ${m.reachedAt.toLocaleDateString()}`;
  }
  return `${label} at ${m.targetPercent}%`; 
}

/**
 * @notice Component showing a milestone notification panel.
 */
export default function MilestoneNotifications(
  props: MilestoneNotificationsProps
) {
  const progress = clampProgress(props.currentProgress);
  const upcoming = getUpcomingMilestones(props.milestones, progress);

  return (
    <section aria-label="milestone-notifications" className="milestone-notifications">
      <header>
        <h2>{sanitizeLabel(props.campaignName)}</h2>
        <p>
          Current progress: <strong>{progress}%</strong>
        </p>
      </header>

      <div className="milestone-notifications__bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <div className="milestone-notifications__fill" style={{ width: `${progress}%` }} />
      </div>

      {upcoming.length === 0 ? (
        <p className="milestone-notifications__none">No upcoming milestones.&nbsp;Keep pushing!</p>
      ) : (
        <ul className="milestone-notifications__list">
          {upcoming.map((milestone) => (
            <li key={milestone.id} className="milestone-notifications__item">
              <button
                onClick={() => props.onMilestoneClick?.(milestone.id)}
                className="milestone-notifications__link"
              >
                {buildMilestoneDescription(milestone)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
