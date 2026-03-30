import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * @title MilestoneConfetti
 * @notice Renders an animated confetti celebration overlay when a crowdfunding
 *         campaign crosses a funding milestone (25%, 50%, 75%, 100%).
 *         Confetti particles fall from the top of a canvas overlay with
 *         a dismissible banner and an accessible live region for screen readers.
 *
 * @dev Security assumptions:
 *   - No dangerouslySetInnerHTML — all content rendered as React text nodes.
 *   - All user-supplied strings (campaignName) are sanitized before render.
 *   - Progress values are clamped to [0, 100] to prevent layout abuse.
 *   - Canvas drawing uses only hardcoded color palettes — no user-controlled CSS.
 *   - All timers and animation frames are cancelled on unmount to prevent leaks.
 *   - onMilestone / onDismiss callbacks are guarded against post-unmount calls.
 *
 * @custom:accessibility
 *   - role="status" + aria-live="polite" for screen-reader announcements.
 *   - Dismiss button has aria-label for assistive technology.
 *   - Canvas is aria-hidden="true" — purely decorative.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Milestone thresholds as funding percentages. */
export const CONFETTI_MILESTONES = [25, 50, 75, 100] as const;
export type ConfettiMilestone = (typeof CONFETTI_MILESTONES)[number];

/** Auto-dismiss delay in milliseconds. 0 disables auto-dismiss. */
export const DEFAULT_CONFETTI_DISMISS_MS = 5_000;

/** Maximum characters for campaign name display. */
export const MAX_CONFETTI_NAME_LENGTH = 60;

/** Number of confetti particles spawned per trigger. */
export const PARTICLES_PER_BURST = 80;

/** Canvas width in logical pixels. */
export const CANVAS_WIDTH = 400;

/** Canvas height in logical pixels. */
export const CANVAS_HEIGHT = 220;

/** Confetti particle colours per milestone (hardcoded — no user-controlled values). */
export const MILESTONE_COLORS: Record<ConfettiMilestone, string[]> = {
  25: ["#34d399", "#6ee7b7", "#a7f3d0", "#d1fae5"],
  50: ["#60a5fa", "#93c5fd", "#bfdbfe", "#dbeafe"],
  75: ["#f59e0b", "#fbbf24", "#fcd34d", "#fde68a"],
  100: ["#f43f5e", "#fb7185", "#fda4af", "#4f46e5", "#818cf8", "#fbbf24"],
};

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * @notice Clamps a numeric progress value to [0, 100].
 * @param value Raw progress percentage.
 * @returns Clamped value, or 0 for non-numeric input.
 */
export function clampConfettiProgress(value: number): number {
  if (typeof value !== "number" || isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * @notice Sanitizes a user-supplied string for safe display.
 *   - Rejects non-strings.
 *   - Strips control characters (U+0000–U+001F, U+007F).
 *   - Collapses whitespace.
 *   - Truncates to maxLength.
 * @param input     Raw string.
 * @param maxLength Maximum allowed length (default: MAX_CONFETTI_NAME_LENGTH).
 * @returns Sanitized string, or empty string on invalid input.
 */
export function sanitizeConfettiName(
  input: unknown,
  maxLength = MAX_CONFETTI_NAME_LENGTH
): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * @notice Returns the highest milestone threshold that `progress` has reached,
 *         or null if none.
 * @param progress Clamped progress value [0, 100].
 */
export function getReachedMilestone(
  progress: number
): ConfettiMilestone | null {
  const reached = [...CONFETTI_MILESTONES]
    .reverse()
    .find((m) => progress >= m);
  return reached ?? null;
}

// ── Particle type ─────────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  width: number;
  height: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
}

function createParticles(
  colors: string[],
  canvasWidth: number
): Particle[] {
  return Array.from({ length: PARTICLES_PER_BURST }, () => {
    const color = colors[Math.floor(Math.random() * colors.length)];
    return {
      x: Math.random() * canvasWidth,
      y: -10,
      vx: (Math.random() - 0.5) * 2,
      vy: 1.5 + Math.random() * 2.5,
      color,
      width: 6 + Math.random() * 6,
      height: 4 + Math.random() * 4,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
      opacity: 1,
    };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface MilestoneConfettiProps {
  /** Current funding progress as a percentage [0, 100]. */
  progress: number;
  /** Campaign name shown in the celebration banner. */
  campaignName?: string;
  /** Auto-dismiss delay in ms. Pass 0 to disable. */
  dismissMs?: number;
  /** Called when a new milestone is first reached. */
  onMilestone?: (milestone: ConfettiMilestone) => void;
  /** Called when the overlay is dismissed. */
  onDismiss?: () => void;
}

/**
 * @notice Milestone confetti celebration overlay component.
 *
 * Renders a canvas-based confetti animation and a dismissible banner whenever
 * the campaign crosses a new milestone threshold. Each milestone fires only
 * once per component lifetime.
 */
export const MilestoneConfetti: React.FC<MilestoneConfettiProps> = ({
  progress,
  campaignName = "",
  dismissMs = DEFAULT_CONFETTI_DISMISS_MS,
  onMilestone,
  onDismiss,
}) => {
  const safeProgress = clampConfettiProgress(progress);
  const safeName = sanitizeConfettiName(campaignName);

  const [activeMilestone, setActiveMilestone] =
    useState<ConfettiMilestone | null>(null);
  const [visible, setVisible] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef<Set<ConfettiMilestone>>(new Set());
  const mountedRef = useRef(true);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Detect newly reached milestones
  useEffect(() => {
    const milestone = getReachedMilestone(safeProgress);
    if (milestone && !firedRef.current.has(milestone)) {
      firedRef.current.add(milestone);
      setActiveMilestone(milestone);
      setVisible(true);
      onMilestone?.(milestone);
    }
  }, [safeProgress, onMilestone]);

  // Canvas animation
  useEffect(() => {
    if (!visible || !activeMilestone) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const colors = MILESTONE_COLORS[activeMilestone];
    particlesRef.current = createParticles(colors, CANVAS_WIDTH);

    const animate = () => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      particlesRef.current = particlesRef.current.filter((p) => p.opacity > 0);

      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        // Fade out as particle approaches bottom
        if (p.y > CANVAS_HEIGHT * 0.6) {
          p.opacity -= 0.02;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
        ctx.restore();
      }

      if (particlesRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [visible, activeMilestone]);

  // Auto-dismiss timer
  useEffect(() => {
    if (!visible || dismissMs <= 0) return;

    dismissTimerRef.current = setTimeout(() => {
      if (mountedRef.current) handleDismiss();
    }, dismissMs);

    return () => {
      if (dismissTimerRef.current !== null)
        clearTimeout(dismissTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, dismissMs]);

  const handleDismiss = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (dismissTimerRef.current !== null)
      clearTimeout(dismissTimerRef.current);
    setVisible(false);
    setActiveMilestone(null);
    onDismiss?.();
  }, [onDismiss]);

  if (!visible || !activeMilestone) return null;

  const label =
    safeName
      ? `🎉 ${safeName} reached ${activeMilestone}% funded!`
      : `🎉 Campaign reached ${activeMilestone}% funded!`;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={label}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      {/* Decorative confetti canvas */}
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        aria-hidden="true"
        style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)" }}
      />

      {/* Celebration banner */}
      <div
        role="status"
        aria-live="polite"
        style={{
          pointerEvents: "auto",
          background: "rgba(255,255,255,0.95)",
          borderRadius: "12px",
          padding: "16px 24px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
          textAlign: "center",
          maxWidth: "360px",
          zIndex: 1,
        }}
      >
        <p style={{ margin: "0 0 12px", fontSize: "1.1rem", fontWeight: 600 }}>
          {label}
        </p>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss celebration"
          style={{
            padding: "6px 18px",
            borderRadius: "6px",
            border: "none",
            background: "#4f46e5",
            color: "#fff",
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default MilestoneConfetti;
