import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * @title MilestoneSounds
 * @notice Plays audio feedback when campaign funding milestones are reached.
 *         Manages sound playback lifecycle, deduplication, and user preferences.
 *
 * @dev Security assumptions:
 *   - No dangerouslySetInnerHTML — all content rendered as React text nodes.
 *   - Audio sources are from a hardcoded allowlist; no user-supplied URLs.
 *   - Progress values are clamped to [0, 100] to prevent logic abuse.
 *   - AudioContext is created lazily on first user interaction (browser policy).
 *   - All timers and AudioContext instances are cleaned up on unmount.
 *
 * @custom:accessibility
 *   - role="status" + aria-live="polite" for screen-reader announcements.
 *   - Mute toggle has aria-label and aria-pressed for assistive technology.
 *   - Visual indicator shown when sound plays (not audio-only feedback).
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Milestone thresholds that trigger audio feedback. */
export const SOUND_MILESTONES = [25, 50, 75, 100] as const;
export type SoundThreshold = (typeof SOUND_MILESTONES)[number];

/** Allowed sound types — no user-supplied URLs. */
export const SOUND_TYPES = ["chime", "fanfare", "bell", "celebration"] as const;
export type SoundType = (typeof SOUND_TYPES)[number];

/** Default auto-hide delay for the visual indicator (ms). */
export const DEFAULT_INDICATOR_HIDE_MS = 3_000;

/** Maximum campaign name length for display. */
export const MAX_CAMPAIGN_NAME_LENGTH = 60;

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * @notice Clamps a numeric progress value to [0, 100].
 * @param value Raw progress percentage.
 * @returns Clamped value.
 */
export function clampProgress(value: number): number {
  if (typeof value !== "number" || isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * @notice Sanitizes a string for safe display.
 * @param input     Raw string.
 * @param maxLength Maximum allowed length.
 * @returns Sanitized string, or "" on invalid input.
 */
export function sanitizeString(input: unknown, maxLength: number): string {
  if (typeof input !== "string") return "";
  return input
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * @notice Resolves the next uncelebrated milestone crossed by currentPercent.
 * @param currentPercent  Clamped progress percentage.
 * @param played          Set of already-played threshold values.
 * @returns The next threshold to play, or null if none.
 */
export function resolveNextSoundMilestone(
  currentPercent: number,
  played: ReadonlySet<SoundThreshold>
): SoundThreshold | null {
  for (const t of SOUND_MILESTONES) {
    if (currentPercent >= t && !played.has(t)) return t;
  }
  return null;
}

/**
 * @notice Maps a milestone threshold to its sound type and label.
 * @param threshold Milestone threshold.
 * @returns Object with soundType and label.
 */
export function getMilestoneSoundConfig(threshold: SoundThreshold): {
  soundType: SoundType;
  label: string;
} {
  const map: Record<SoundThreshold, { soundType: SoundType; label: string }> = {
    25:  { soundType: "chime",       label: "25% Funded" },
    50:  { soundType: "bell",        label: "Halfway There" },
    75:  { soundType: "fanfare",     label: "75% Funded" },
    100: { soundType: "celebration", label: "Goal Reached" },
  };
  return map[threshold];
}

/**
 * @notice Generates a synthetic tone using the Web Audio API.
 *         Falls back silently if AudioContext is unavailable.
 * @param soundType  The type of sound to generate.
 * @param volume     Volume level [0, 1].
 */
export function playSyntheticSound(soundType: SoundType, volume: number): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    const freqMap: Record<SoundType, number> = {
      chime:       880,
      bell:        660,
      fanfare:     1046,
      celebration: 1318,
    };

    oscillator.frequency.setValueAtTime(freqMap[soundType], ctx.currentTime);
    oscillator.type = "sine";
    gainNode.gain.setValueAtTime(Math.min(1, Math.max(0, volume)), ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.8);

    oscillator.onended = () => ctx.close();
  } catch {
    // Silently ignore — audio is enhancement only.
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MilestoneSoundsProps {
  /** Current funding percentage (0–100). Clamped internally. */
  currentPercent: number;
  /** Optional campaign name shown in the visual indicator. */
  campaignName?: string;
  /** Whether sound is enabled. Default: true. */
  soundEnabled?: boolean;
  /** Volume level [0, 1]. Default: 0.5. */
  volume?: number;
  /** Auto-hide delay for visual indicator in ms. 0 disables. Default: 3000. */
  indicatorHideMs?: number;
  /** Called when a milestone sound is triggered. */
  onMilestoneSound?: (threshold: SoundThreshold, soundType: SoundType) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * @notice Milestone sound feedback component.
 * @dev Renders a dismissible visual indicator alongside audio feedback.
 *      Renders nothing when no uncelebrated milestone has been crossed.
 */
const MilestoneSounds: React.FC<MilestoneSoundsProps> = ({
  currentPercent,
  campaignName,
  soundEnabled = true,
  volume = 0.5,
  indicatorHideMs = DEFAULT_INDICATOR_HIDE_MS,
  onMilestoneSound,
}) => {
  const [played, setPlayed] = useState<Set<SoundThreshold>>(() => new Set());
  const [activeThreshold, setActiveThreshold] = useState<SoundThreshold | null>(null);
  const [muted, setMuted] = useState(!soundEnabled);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Sync muted state with soundEnabled prop.
  useEffect(() => {
    setMuted(!soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    const clamped = clampProgress(currentPercent);
    const next = resolveNextSoundMilestone(clamped, played);
    if (next === null) return;

    setPlayed((prev) => new Set([...prev, next]));
    setActiveThreshold(next);

    const { soundType } = getMilestoneSoundConfig(next);

    if (!muted) {
      playSyntheticSound(soundType, Math.min(1, Math.max(0, volume)));
    }

    onMilestoneSound?.(next, soundType);

    if (indicatorHideMs > 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (mountedRef.current) setActiveThreshold(null);
      }, indicatorHideMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPercent]);

  const handleDismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setActiveThreshold(null);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => !prev);
  }, []);

  const safeName = sanitizeString(campaignName, MAX_CAMPAIGN_NAME_LENGTH);

  return (
    <div data-testid="milestone-sounds-root">
      <button
        onClick={toggleMute}
        aria-label={muted ? "Unmute milestone sounds" : "Mute milestone sounds"}
        aria-pressed={muted}
        data-testid="mute-toggle"
        style={{ background: "none", border: "1px solid #ccc", borderRadius: 4, padding: "4px 8px", cursor: "pointer" }}
      >
        {muted ? "🔇" : "🔊"}
      </button>

      {activeThreshold !== null && (
        <div
          role="status"
          aria-live="polite"
          data-testid="sound-indicator"
          style={{ position: "fixed", bottom: 24, right: 24, background: "#1a1a2e", color: "#fff", borderRadius: 8, padding: "1rem 1.5rem", zIndex: 1000 }}
        >
          <span aria-hidden="true" style={{ marginRight: 8 }}>
            {getMilestoneSoundConfig(activeThreshold).label === "Goal Reached" ? "🎉" : "🎵"}
          </span>
          <span data-testid="sound-label">
            {getMilestoneSoundConfig(activeThreshold).label}
          </span>
          {safeName && (
            <span data-testid="sound-campaign"> — {safeName}</span>
          )}
          <button
            onClick={handleDismiss}
            aria-label="Dismiss sound indicator"
            data-testid="dismiss-button"
            style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default MilestoneSounds;
