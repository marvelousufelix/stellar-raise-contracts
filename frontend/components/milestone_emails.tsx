import React, { useMemo } from "react";

/**
 * @title MilestoneEmail
 * @notice Renders a milestone celebration email preview card for campaign contributors.
 *         Displays funding progress, personalized greeting, and a send CTA.
 *
 * @dev Security assumptions:
 *   - No dangerouslySetInnerHTML — all content rendered as React text nodes.
 *   - recipientName and campaignTitle are rendered as text, never as HTML.
 *   - onSend callback receives a static recipient string; no user-controlled HTML.
 *   - currentPercent is clamped to [0, 100] before display.
 *
 * @custom:accessibility
 *   - role="region" with aria-label for the email preview section.
 *   - CTA button has an explicit aria-label.
 */

export interface MilestoneEmailProps {
  /** Campaign title shown in the email subject/header */
  campaignTitle: string;
  /** Name of the campaign creator */
  creatorName: string;
  /** Current funding percentage (0–100) */
  currentPercent: number;
  /** Total amount raised so far */
  totalRaised: number;
  /** Campaign funding goal */
  goal: number;
  /** Human-readable milestone label, e.g. "Half Way There" */
  milestoneLabel: string;
  /** Optional recipient name for personalized greeting */
  recipientName?: string;
  /** Called with recipient identifier when the send button is clicked */
  onSend?: (recipient: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MilestoneEmail({
  campaignTitle,
  creatorName,
  currentPercent,
  totalRaised,
  goal,
  milestoneLabel,
  recipientName,
  onSend,
}: MilestoneEmailProps) {
  const clampedPercent = useMemo(
    () => Math.min(100, Math.max(0, currentPercent)),
    [currentPercent],
  );

  const greeting = recipientName
    ? `Hi ${recipientName},`
    : "Hi there,";

  const recipient = recipientName ?? "contributor";

  function handleSend() {
    onSend?.(recipient);
  }

  return (
    <section role="region" aria-label="Milestone Celebration Email Preview">
      <article className="milestone-email-card">
        <header className="milestone-email-header">
          <h2 className="milestone-email-title">{campaignTitle}</h2>
          <p className="milestone-email-badge">{milestoneLabel}</p>
        </header>

        <div className="milestone-email-body">
          <p className="milestone-email-greeting">{greeting}</p>
          <p className="milestone-email-message">
            {"Great news! The campaign "}
            <strong>{campaignTitle}</strong>
            {` has reached ${clampedPercent}% of its funding goal.`}
          </p>

          <div className="milestone-email-stats" aria-label="Funding progress">
            <span className="milestone-email-raised">
              {`Raised: ${totalRaised}`}
            </span>
            <span className="milestone-email-goal">
              {` / Goal: ${goal}`}
            </span>
          </div>

          <p className="milestone-email-creator">
            {`Campaign by ${creatorName}`}
          </p>
        </div>

        <footer className="milestone-email-footer">
          <button
            className="milestone-email-cta"
            aria-label={`Send milestone celebration email to ${recipient}`}
            onClick={handleSend}
            type="button"
          >
            Send Celebration Email
          </button>
        </footer>
      </article>
    </section>
  );
}
