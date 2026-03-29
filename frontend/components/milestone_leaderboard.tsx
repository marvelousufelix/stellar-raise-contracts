import React, { useMemo } from "react";

/**
 * @title MilestoneLeaderboard
 * @notice Renders a ranked leaderboard of campaign contributors sorted by
 *         contribution amount. Supports address privacy, medal styling for
 *         top 3, and per-entry mini progress bars.
 *
 * @dev Security assumptions:
 *   - No dangerouslySetInnerHTML — all content rendered as React text nodes.
 *   - Addresses are truncated by default to prevent accidental PII exposure.
 *   - displayName is rendered as text, never as HTML.
 *   - contribution/goal division is guarded against division by zero.
 *   - Entry list is sorted and sliced in a pure memo; original array is not mutated.
 *
 * @custom:accessibility
 *   - role="region" with aria-label="Milestone Leaderboard".
 *   - Entries rendered as role="list" / role="listitem".
 *   - Each entry's progress bar has aria-valuenow/min/max.
 */

export interface LeaderboardEntry {
  rank: number;
  address: string;
  contribution: number;
  displayName?: string;
}

export interface MilestoneLeaderboardProps {
  /** Contributor entries to display */
  entries: LeaderboardEntry[];
  /** Campaign funding goal (used for per-entry progress bars) */
  goal: number;
  /** Current overall funding percentage (0–100) */
  currentPercent: number;
  /** Maximum number of entries to show (default: 10) */
  maxVisible?: number;
  /** Show full addresses; when false (default) addresses are truncated */
  showAddresses?: boolean;
  /** Called with the entry when a row is clicked */
  onEntryClick?: (entry: LeaderboardEntry) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncateAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function medalClass(index: number): string {
  if (index === 0) return "gold";
  if (index === 1) return "silver";
  if (index === 2) return "bronze";
  return "";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MilestoneLeaderboard({
  entries,
  goal,
  currentPercent: _currentPercent,
  maxVisible = 10,
  showAddresses = false,
  onEntryClick,
}: MilestoneLeaderboardProps) {
  const sorted = useMemo(
    () =>
      [...entries]
        .sort((a, b) => b.contribution - a.contribution)
        .slice(0, maxVisible),
    [entries, maxVisible],
  );

  const safeGoal = goal > 0 ? goal : 1;

  return (
    <section role="region" aria-label="Milestone Leaderboard">
      <ol role="list" className="leaderboard-list">
        {sorted.map((entry, index) => {
          const barPercent = Math.min(
            100,
            Math.max(0, (entry.contribution / safeGoal) * 100),
          );
          const label = entry.displayName
            ? entry.displayName
            : showAddresses
              ? entry.address
              : truncateAddress(entry.address);
          const medal = medalClass(index);

          return (
            <li
              key={entry.address}
              role="listitem"
              className={`leaderboard-entry${medal ? ` ${medal}` : ""}`}
              onClick={() => onEntryClick?.(entry)}
            >
              <span className="leaderboard-rank">{index + 1}</span>
              <span className="leaderboard-label">{label}</span>
              <span className="leaderboard-contribution">
                {entry.contribution}
              </span>
              <div
                className="leaderboard-bar"
                role="progressbar"
                aria-valuenow={barPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="leaderboard-bar-fill"
                  style={{ width: `${barPercent}%` }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
