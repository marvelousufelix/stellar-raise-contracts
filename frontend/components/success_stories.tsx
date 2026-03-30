import React, { useMemo } from "react";

/**
 * @title SuccessStories
 * @notice Renders a campaign success-story showcase for inspiration and social proof.
 *
 * @dev Security assumptions:
 *   - No dangerouslySetInnerHTML; all content is rendered as text nodes.
 *   - User-provided text is sanitized and length-limited.
 *   - Numeric fields are clamped to safe ranges.
 *   - URLs are validated and only absolute https/http links are exposed.
 */

export interface SuccessStory {
  id: string;
  campaignName: string;
  creatorName: string;
  raisedAmount: number;
  goalAmount: number;
  summary: string;
  backers: number;
  completedAt: Date;
  coverImageUrl?: string;
  campaignUrl?: string;
}

export interface SuccessStoriesProps {
  stories: SuccessStory[];
  heading?: string;
  onStorySelect?: (story: SuccessStory) => void;
}

export const sanitizeStoryText = (value: unknown, maxLength = 220): string => {
  if (typeof value !== "string") return "";
  return value
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
};

export const clampNumber = (
  value: unknown,
  min: number,
  max: number,
): number => {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
};

export const formatCurrency = (amount: number): string => {
  const safe = clampNumber(amount, 0, Number.MAX_SAFE_INTEGER);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(safe);
};

export const calculateProgress = (raised: number, goal: number): number => {
  if (goal <= 0) return 0;
  return clampNumber((raised / goal) * 100, 0, 1000);
};

export const sanitizeUrl = (value?: string): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
};

const SuccessStories: React.FC<SuccessStoriesProps> = ({
  stories,
  heading = "Campaign Success Stories",
  onStorySelect,
}) => {
  const safeHeading = useMemo(() => sanitizeStoryText(heading, 80), [heading]);

  const safeStories = useMemo(
    () =>
      stories
        .map((story) => {
          const raised = clampNumber(
            story.raisedAmount,
            0,
            Number.MAX_SAFE_INTEGER,
          );
          const goal = clampNumber(
            story.goalAmount,
            1,
            Number.MAX_SAFE_INTEGER,
          );
          return {
            ...story,
            campaignName: sanitizeStoryText(story.campaignName, 80),
            creatorName:
              sanitizeStoryText(story.creatorName, 60) || "Anonymous",
            summary: sanitizeStoryText(story.summary, 320),
            raisedAmount: raised,
            goalAmount: goal,
            backers: clampNumber(story.backers, 0, 1_000_000),
            campaignUrl: sanitizeUrl(story.campaignUrl),
          };
        })
        .sort((a, b) => {
          const progressA = calculateProgress(a.raisedAmount, a.goalAmount);
          const progressB = calculateProgress(b.raisedAmount, b.goalAmount);
          return progressB - progressA;
        }),
    [stories],
  );

  if (safeStories.length === 0) {
    return (
      <section
        aria-label="Success stories showcase"
        className="success-stories"
      >
        <h2>{safeHeading}</h2>
        <p>No success stories yet. Launch the next one.</p>
      </section>
    );
  }

  return (
    <section aria-label="Success stories showcase" className="success-stories">
      <header className="success-stories__header">
        <h2>{safeHeading}</h2>
        <p>Real campaign outcomes to inspire your next launch.</p>
      </header>

      <div className="success-stories__grid" role="list">
        {safeStories.map((story, index) => {
          const progress = calculateProgress(
            story.raisedAmount,
            story.goalAmount,
          );
          const progressLabel = `${Math.round(progress)}% funded`;

          return (
            <article
              key={story.id}
              className="success-stories__card"
              role="listitem"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <div className="success-stories__visual" aria-hidden="true">
                {story.coverImageUrl ? (
                  <img
                    src={story.coverImageUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="success-stories__placeholder">
                    {story.campaignName.slice(0, 1)}
                  </div>
                )}
              </div>

              <div className="success-stories__content">
                <p className="success-stories__meta">by {story.creatorName}</p>
                <h3>{story.campaignName}</h3>
                <p>{story.summary}</p>

                <div className="success-stories__stats">
                  <strong>{formatCurrency(story.raisedAmount)}</strong>
                  <span>Goal {formatCurrency(story.goalAmount)}</span>
                  <span>{story.backers} backers</span>
                  <span aria-label="Funding progress">{progressLabel}</span>
                </div>

                <div className="success-stories__actions">
                  <button
                    type="button"
                    onClick={() => onStorySelect?.(story)}
                    aria-label={`Read story: ${story.campaignName}`}
                  >
                    Read Story
                  </button>
                  {story.campaignUrl && (
                    <a
                      href={story.campaignUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                      aria-label={`Open campaign page for ${story.campaignName}`}
                    >
                      Visit Campaign
                    </a>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default SuccessStories;
