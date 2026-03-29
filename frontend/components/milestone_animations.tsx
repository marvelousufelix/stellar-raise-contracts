import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * @title MilestoneAnimations
 * @notice Renders celebration animations when campaign milestones are reached.
 *         Supports confetti, pulse, and bounce animations with customizable
 *         duration and intensity.
 *
 * @dev Security assumptions:
 *   - No dangerouslySetInnerHTML — all content rendered as React text nodes.
 *   - Animation values are clamped to safe ranges.
 *   - All timers are cleaned up on unmount.
 *   - Callbacks are guarded against post-unmount calls.
 *
 * @custom:accessibility
 *   - role="status" + aria-live="polite" for announcements.
 *   - Animations respect prefers-reduced-motion.
 */

export interface MilestoneAnimationsProps {
  /** Current funding percentage (0-100) */
  currentPercent: number;
  /** Milestone thresholds to trigger animations */
  milestones: number[];
  /** Animation type: 'confetti' | 'pulse' | 'bounce' */
  animationType?: "confetti" | "pulse" | "bounce";
  /** Duration of animation in milliseconds */
  duration?: number;
  /** Intensity of animation (1-10) */
  intensity?: number;
  /** Callback when animation completes */
  onAnimationComplete?: () => void;
  /** Auto-dismiss delay in milliseconds */
  autoDismissMs?: number;
}

export interface AnimationParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ANIMATION_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#FFA07A",
  "#98D8C8",
  "#F7DC6F",
];

const DEFAULT_DURATION = 2000;
const DEFAULT_INTENSITY = 5;
const PARTICLE_COUNT = 50;
const GRAVITY = 0.1;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Clamps a value between min and max.
 */
function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Checks if user prefers reduced motion.
 */
function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Creates initial animation particles.
 */
function createParticles(
  count: number,
  intensity: number,
): AnimationParticle[] {
  const particles: AnimationParticle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.random() * Math.PI * 2);
    const speed = Math.random() * intensity * 2 + intensity;
    particles.push({
      x: Math.random() * 100,
      y: Math.random() * 100,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      maxLife: 1,
      color: ANIMATION_COLORS[Math.floor(Math.random() * ANIMATION_COLORS.length)],
    });
  }
  return particles;
}

/**
 * Updates particle positions and lifetimes.
 */
function updateParticles(
  particles: AnimationParticle[],
  deltaTime: number,
): AnimationParticle[] {
  return particles
    .map((p) => ({
      ...p,
      x: p.x + p.vx * deltaTime,
      y: p.y + p.vy * deltaTime,
      vy: p.vy + GRAVITY * deltaTime,
      life: p.life - deltaTime / 1000,
    }))
    .filter((p) => p.life > 0);
}

/**
 * Sanitizes milestone value.
 */
function sanitizeMilestone(value: number): number {
  return clampValue(Math.floor(value), 0, 100);
}

// ── Component ─────────────────────────────────────────────────────────────────

const MilestoneAnimations: React.FC<MilestoneAnimationsProps> = ({
  currentPercent,
  milestones,
  animationType = "confetti",
  duration = DEFAULT_DURATION,
  intensity = DEFAULT_INTENSITY,
  onAnimationComplete,
  autoDismissMs = 0,
}) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [particles, setParticles] = useState<AnimationParticle[]>([]);
  const [triggeredMilestones, setTriggeredMilestones] = useState<Set<number>>(
    new Set(),
  );
  const animationFrameRef = useRef<number | null>(null);
  const dismissTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const clampedPercent = clampValue(currentPercent, 0, 100);
  const clampedIntensity = clampValue(intensity, 1, 10);
  const clampedDuration = Math.max(100, duration);
  const sanitizedMilestones = milestones.map(sanitizeMilestone);

  // Check for milestone triggers
  useEffect(() => {
    const newMilestones = sanitizedMilestones.filter(
      (m) => clampedPercent >= m && !triggeredMilestones.has(m),
    );

    if (newMilestones.length > 0) {
      setTriggeredMilestones((prev) => {
        const updated = new Set(prev);
        newMilestones.forEach((m) => updated.add(m));
        return updated;
      });

      if (!prefersReducedMotion()) {
        setIsAnimating(true);
        setParticles(createParticles(PARTICLE_COUNT, clampedIntensity));
      }
    }
  }, [clampedPercent, sanitizedMilestones, triggeredMilestones]);

  // Animation loop
  useEffect(() => {
    if (!isAnimating || prefersReducedMotion()) return;

    const startTime = Date.now();
    let lastTime = startTime;

    const animate = () => {
      if (!isMountedRef.current) return;

      const now = Date.now();
      const deltaTime = now - lastTime;
      const elapsed = now - startTime;

      lastTime = now;

      setParticles((prev) => {
        const updated = updateParticles(prev, deltaTime);
        if (updated.length === 0 && elapsed > clampedDuration) {
          setIsAnimating(false);
          if (onAnimationComplete) onAnimationComplete();
          return [];
        }
        return updated;
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isAnimating, clampedDuration, onAnimationComplete]);

  // Auto-dismiss
  useEffect(() => {
    if (isAnimating && autoDismissMs > 0) {
      dismissTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setIsAnimating(false);
        }
      }, autoDismissMs);
    }

    return () => {
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    };
  }, [isAnimating, autoDismissMs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
      }
    };
  }, []);

  if (!isAnimating || particles.length === 0) {
    return null;
  }

  return (
    <div
      className="milestone-animations-container"
      role="status"
      aria-live="polite"
      aria-label="Milestone celebration animation"
    >
      <svg
        className={`milestone-animations-svg milestone-animations-${animationType}`}
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        {particles.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={2}
            fill={p.color}
            opacity={p.life / p.maxLife}
          />
        ))}
      </svg>
    </div>
  );
};

export default MilestoneAnimations;
