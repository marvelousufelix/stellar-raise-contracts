import React, { useMemo, useState } from "react";

/**
 * @title MilestoneTestimonials
 * @notice Displays campaign milestone celebration testimonials with social proof,
 *         contributor quotes, and achievement stories for frontend UI.
 *
 * @dev Security assumptions:
 *   - No dangerouslySetInnerHTML — all content rendered as React text nodes.
 *   - All user-supplied strings are sanitized before render.
 *   - Testimonial content is validated and length-limited.
 *   - No user-controlled CSS or styling injection.
 *
 * @custom:accessibility
 *   - Semantic HTML with proper ARIA labels.
 *   - Carousel navigation is keyboard accessible.
 *   - Screen reader announcements for testimonial changes.
 */

export interface Testimonial {
  id: string;
  contributor: string;
  content: string;
  milestone: string;
  date: Date;
  rating?: number;
}

export interface MilestoneTestimonialsProps {
  campaignName: string;
  testimonials: Testimonial[];
  onTestimonialSelect?: (testimonial: Testimonial) => void;
}

/**
 * Sanitizes user-supplied strings to prevent XSS.
 */
export const sanitizeTestimonialText = (text: string): string => {
  if (typeof text !== "string") return "";
  return text
    .replace(/[<>]/g, "")
    .substring(0, 500);
};

/**
 * Sanitizes contributor name.
 */
export const sanitizeContributorName = (name: string): string => {
  if (typeof name !== "string") return "Anonymous";
  return name
    .replace(/[<>]/g, "")
    .substring(0, 50);
};

/**
 * Validates rating value.
 */
export const validateRating = (rating?: number): number => {
  if (rating === undefined) return 0;
  const num = Number(rating);
  return Math.max(0, Math.min(5, isNaN(num) ? 0 : num));
};

/**
 * Formats testimonial date.
 */
export const formatTestimonialDate = (date: Date): string => {
  try {
    if (!date || isNaN(date.getTime())) {
      return "Unknown date";
    }
    return date.toLocaleDateString();
  } catch {
    return "Unknown date";
  }
};

/**
 * MilestoneTestimonials Component
 */
const MilestoneTestimonials: React.FC<MilestoneTestimonialsProps> = ({
  campaignName,
  testimonials,
  onTestimonialSelect,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const sanitizedName = useMemo(
    () => sanitizeTestimonialText(campaignName),
    [campaignName]
  );

  const enrichedTestimonials = useMemo(
    () =>
      testimonials.map((t) => ({
        ...t,
        contributor: sanitizeContributorName(t.contributor),
        content: sanitizeTestimonialText(t.content),
        milestone: sanitizeTestimonialText(t.milestone),
        rating: validateRating(t.rating),
      })),
    [testimonials]
  );

  const currentTestimonial = enrichedTestimonials[currentIndex] || null;

  const handlePrevious = () => {
    setCurrentIndex((prev) =>
      prev === 0 ? enrichedTestimonials.length - 1 : prev - 1
    );
  };

  const handleNext = () => {
    setCurrentIndex((prev) =>
      prev === enrichedTestimonials.length - 1 ? 0 : prev + 1
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      handlePrevious();
    } else if (e.key === "ArrowRight") {
      handleNext();
    }
  };

  if (enrichedTestimonials.length === 0) {
    return (
      <div className="milestone-testimonials" role="region" aria-label="Campaign testimonials">
        <h2 className="milestone-testimonials__title">
          {sanitizedName} - Testimonials
        </h2>
        <p className="milestone-testimonials__empty">
          No testimonials yet. Be the first to share your experience!
        </p>
      </div>
    );
  }

  return (
    <div
      className="milestone-testimonials"
      role="region"
      aria-label="Campaign testimonials"
      onKeyDown={handleKeyDown}
    >
      <h2 className="milestone-testimonials__title">
        {sanitizedName} - Testimonials
      </h2>

      <div className="milestone-testimonials__carousel">
        <div className="milestone-testimonials__card">
          {currentTestimonial && (
            <>
              <div className="milestone-testimonials__header">
                <h3 className="milestone-testimonials__contributor">
                  {currentTestimonial.contributor}
                </h3>
                <div className="milestone-testimonials__meta">
                  <span className="milestone-testimonials__milestone">
                    {currentTestimonial.milestone}
                  </span>
                  <span className="milestone-testimonials__date">
                    {formatTestimonialDate(currentTestimonial.date)}
                  </span>
                </div>
              </div>

              {currentTestimonial.rating > 0 && (
                <div className="milestone-testimonials__rating" aria-label={`Rating: ${currentTestimonial.rating} out of 5 stars`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span
                      key={i}
                      className={`milestone-testimonials__star ${
                        i < currentTestimonial.rating
                          ? "milestone-testimonials__star--filled"
                          : ""
                      }`}
                      aria-hidden="true"
                    >
                      ★
                    </span>
                  ))}
                </div>
              )}

              <p className="milestone-testimonials__content">
                {currentTestimonial.content}
              </p>

              <button
                className="milestone-testimonials__select-btn"
                onClick={() => onTestimonialSelect?.(currentTestimonial)}
                aria-label={`Select testimonial from ${currentTestimonial.contributor}`}
              >
                View Full Story
              </button>
            </>
          )}
        </div>

        <div className="milestone-testimonials__controls">
          <button
            className="milestone-testimonials__nav-btn milestone-testimonials__nav-btn--prev"
            onClick={handlePrevious}
            aria-label="Previous testimonial"
          >
            ←
          </button>

          <div className="milestone-testimonials__indicators">
            {enrichedTestimonials.map((_, index) => (
              <button
                key={index}
                className={`milestone-testimonials__indicator ${
                  index === currentIndex
                    ? "milestone-testimonials__indicator--active"
                    : ""
                }`}
                onClick={() => setCurrentIndex(index)}
                aria-label={`Go to testimonial ${index + 1}`}
                aria-current={index === currentIndex ? "page" : undefined}
              />
            ))}
          </div>

          <button
            className="milestone-testimonials__nav-btn milestone-testimonials__nav-btn--next"
            onClick={handleNext}
            aria-label="Next testimonial"
          >
            →
          </button>
        </div>
      </div>

      <div className="milestone-testimonials__counter" aria-live="polite">
        Testimonial {currentIndex + 1} of {enrichedTestimonials.length}
      </div>
    </div>
  );
};

export default MilestoneTestimonials;
