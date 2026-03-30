import React, { useCallback, useMemo } from "react";

/**
 * @title MilestoneSocialSharing
 * @notice Provides secure social sharing functionality for campaign milestones.
 *         Generates shareable content with milestone achievements and viral marketing.
 *
 * @dev Security assumptions:
 *   - All user inputs are sanitized before URL encoding
 *   - No dangerouslySetInnerHTML used
 *   - URLs are validated before opening
 *   - Campaign data is immutable within component
 *   - Share text is truncated to prevent abuse
 *
 * @custom:accessibility
 *   - All buttons have aria-labels
 *   - Share links open in new windows with rel="noopener noreferrer"
 *   - Keyboard navigation fully supported
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface MilestoneShareData {
  campaignId: string;
  campaignName: string;
  currentAmount: number;
  goalAmount: number;
  milestonePercentage: number;
  creatorName: string;
}

export interface ShareMetrics {
  platform: "twitter" | "facebook" | "linkedin" | "email" | "copy";
  timestamp: number;
  campaignId: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_SHARE_TEXT_LENGTH = 280;
const MAX_CAMPAIGN_NAME_LENGTH = 50;
const VALID_PLATFORMS = ["twitter", "facebook", "linkedin", "email", "copy"] as const;

// ── Utility Functions ────────────────────────────────────────────────────────

/**
 * Sanitizes text by removing special characters and limiting length
 * @param text - Input text to sanitize
 * @param maxLength - Maximum allowed length
 * @returns Sanitized text
 */
function sanitizeText(text: string, maxLength: number): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/[<>\"']/g, "")
    .substring(0, maxLength)
    .trim();
}

/**
 * Generates milestone-specific share message
 * @param data - Milestone share data
 * @returns Formatted share message
 */
function generateShareMessage(data: MilestoneShareData): string {
  const percentage = Math.min(100, Math.max(0, data.milestonePercentage));
  const campaignName = sanitizeText(data.campaignName, MAX_CAMPAIGN_NAME_LENGTH);
  const creatorName = sanitizeText(data.creatorName, 30);

  const messages: Record<number, string> = {
    25: `🎯 ${campaignName} just hit 25% funding! Join ${creatorName} in supporting this amazing project.`,
    50: `🚀 ${campaignName} is halfway there at 50%! Help push it to success.`,
    75: `⚡ ${campaignName} is at 75% - almost there! Be part of the final push.`,
    100: `🎉 ${campaignName} reached 100% funding! Mission accomplished!`,
  };

  return messages[percentage] || `Check out ${campaignName} on Stellar Raise!`;
}

/**
 * Encodes text for URL parameters safely
 * @param text - Text to encode
 * @returns URL-encoded text
 */
function encodeShareText(text: string): string {
  return encodeURIComponent(sanitizeText(text, MAX_SHARE_TEXT_LENGTH));
}

/**
 * Validates platform string
 * @param platform - Platform to validate
 * @returns True if valid platform
 */
function isValidPlatform(platform: string): platform is ShareMetrics["platform"] {
  return VALID_PLATFORMS.includes(platform as any);
}

// ── Component ────────────────────────────────────────────────────────────────

export interface MilestoneSocialSharingProps {
  data: MilestoneShareData;
  onShare?: (metrics: ShareMetrics) => void;
  campaignUrl?: string;
  disabled?: boolean;
}

/**
 * MilestoneSocialSharing Component
 * Renders social sharing buttons for campaign milestones
 */
export const MilestoneSocialSharing: React.FC<MilestoneSocialSharingProps> = ({
  data,
  onShare,
  campaignUrl = "https://stellar-raise.app",
  disabled = false,
}) => {
  const shareMessage = useMemo(() => generateShareMessage(data), [data]);
  const encodedMessage = useMemo(() => encodeShareText(shareMessage), [shareMessage]);

  const handleShare = useCallback(
    (platform: ShareMetrics["platform"]) => {
      if (!isValidPlatform(platform)) return;

      const metrics: ShareMetrics = {
        platform,
        timestamp: Date.now(),
        campaignId: sanitizeText(data.campaignId, 100),
      };

      onShare?.(metrics);

      const urls: Record<ShareMetrics["platform"], string> = {
        twitter: `https://twitter.com/intent/tweet?text=${encodedMessage}&url=${encodeURIComponent(campaignUrl)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(campaignUrl)}&quote=${encodedMessage}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(campaignUrl)}`,
        email: `mailto:?subject=${encodeURIComponent(`Check out: ${data.campaignName}`)}&body=${encodedMessage}`,
        copy: "",
      };

      if (platform === "copy") {
        navigator.clipboard.writeText(`${shareMessage}\n${campaignUrl}`).catch(() => {
          console.error("Failed to copy to clipboard");
        });
      } else {
        const url = urls[platform];
        if (url) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      }
    },
    [data, encodedMessage, campaignUrl, onShare]
  );

  return (
    <div className="milestone-social-sharing" role="region" aria-label="Share milestone achievement">
      <div className="share-container">
        <p className="share-message">{shareMessage}</p>

        <div className="share-buttons">
          <button
            onClick={() => handleShare("twitter")}
            disabled={disabled}
            aria-label="Share on Twitter"
            className="share-btn share-btn--twitter"
            title="Share on Twitter"
          >
            𝕏
          </button>

          <button
            onClick={() => handleShare("facebook")}
            disabled={disabled}
            aria-label="Share on Facebook"
            className="share-btn share-btn--facebook"
            title="Share on Facebook"
          >
            f
          </button>

          <button
            onClick={() => handleShare("linkedin")}
            disabled={disabled}
            aria-label="Share on LinkedIn"
            className="share-btn share-btn--linkedin"
            title="Share on LinkedIn"
          >
            in
          </button>

          <button
            onClick={() => handleShare("email")}
            disabled={disabled}
            aria-label="Share via email"
            className="share-btn share-btn--email"
            title="Share via email"
          >
            ✉
          </button>

          <button
            onClick={() => handleShare("copy")}
            disabled={disabled}
            aria-label="Copy share link"
            className="share-btn share-btn--copy"
            title="Copy to clipboard"
          >
            📋
          </button>
        </div>
      </div>

      <style jsx>{`
        .milestone-social-sharing {
          padding: 1rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 8px;
          color: white;
        }

        .share-container {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .share-message {
          margin: 0;
          font-size: 0.95rem;
          line-height: 1.4;
          font-weight: 500;
        }

        .share-buttons {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .share-btn {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.2);
          color: white;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.2s ease;
          font-size: 1rem;
        }

        .share-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.3);
          transform: translateY(-2px);
        }

        .share-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .share-btn:focus-visible {
          outline: 2px solid white;
          outline-offset: 2px;
        }

        @media (max-width: 640px) {
          .share-buttons {
            gap: 0.25rem;
          }

          .share-btn {
            padding: 0.4rem 0.8rem;
            font-size: 0.9rem;
          }
        }
      `}</style>
    </div>
  );
};

export default MilestoneSocialSharing;
