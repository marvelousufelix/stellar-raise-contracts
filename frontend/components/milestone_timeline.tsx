import React, { useMemo } from 'react';

interface Milestone {
  id: string;
  percentage: number;
  label: string;
  description?: string;
  reached: boolean;
  reachedAt?: Date;
}

interface MilestoneTimelineProps {
  currentAmount: number;
  goalAmount: number;
  milestones?: number[];
  onMilestoneReached?: (milestone: Milestone) => void;
}

/**
 * MilestoneTimeline Component
 * Displays campaign progress with celebration milestones
 * 
 * @param currentAmount - Current funds raised
 * @param goalAmount - Target funding goal
 * @param milestones - Array of milestone percentages (default: [25, 50, 75, 100])
 * @param onMilestoneReached - Callback when milestone is reached
 */
export const MilestoneTimeline: React.FC<MilestoneTimelineProps> = ({
  currentAmount,
  goalAmount,
  milestones = [25, 50, 75, 100],
  onMilestoneReached,
}) => {
  const progress = useMemo(() => {
    if (goalAmount === 0) return 0;
    return Math.min((currentAmount / goalAmount) * 100, 100);
  }, [currentAmount, goalAmount]);

  const calculatedMilestones = useMemo<Milestone[]>(() => {
    return milestones.map((percentage) => ({
      id: `milestone-${percentage}`,
      percentage,
      label: `${percentage}%`,
      description: getMilestoneDescription(percentage),
      reached: progress >= percentage,
      reachedAt: progress >= percentage ? new Date() : undefined,
    }));
  }, [milestones, progress]);

  React.useEffect(() => {
    calculatedMilestones.forEach((milestone) => {
      if (milestone.reached && onMilestoneReached) {
        onMilestoneReached(milestone);
      }
    });
  }, [calculatedMilestones, onMilestoneReached]);

  return (
    <div className="milestone-timeline">
      <div className="timeline-header">
        <h3>Campaign Progress</h3>
        <span className="progress-text">
          {Math.round(progress)}% of goal reached
        </span>
      </div>

      <div className="progress-bar-container">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      <div className="milestones-container">
        {calculatedMilestones.map((milestone) => (
          <div
            key={milestone.id}
            className={`milestone ${milestone.reached ? 'reached' : 'pending'}`}
            data-testid={`milestone-${milestone.percentage}`}
          >
            <div className="milestone-marker">
              <div className="milestone-dot" />
              <span className="milestone-label">{milestone.label}</span>
            </div>
            {milestone.description && (
              <p className="milestone-description">{milestone.description}</p>
            )}
            {milestone.reached && (
              <div className="milestone-celebration">
                <span className="celebration-icon">🎉</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="timeline-stats">
        <div className="stat">
          <span className="stat-label">Raised</span>
          <span className="stat-value">${currentAmount.toLocaleString()}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Goal</span>
          <span className="stat-value">${goalAmount.toLocaleString()}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Remaining</span>
          <span className="stat-value">
            ${Math.max(0, goalAmount - currentAmount).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};

/**
 * Get milestone description based on percentage
 */
function getMilestoneDescription(percentage: number): string {
  const descriptions: Record<number, string> = {
    25: 'Great start! 1/4 of the way there',
    50: 'Halfway there! Keep the momentum going',
    75: 'Almost there! Final push needed',
    100: 'Goal reached! Campaign successful',
  };
  return descriptions[percentage] || `${percentage}% milestone`;
}

export default MilestoneTimeline;
