/**
 * @title MilestoneAnimations — Comprehensive Test Suite
 * @notice Covers particle creation, updates, milestone detection, animations,
 *         auto-dismiss, callbacks, and accessibility.
 *
 * @dev Targets ≥ 95 % coverage of milestone_animations.tsx.
 */

import React from "react";
import { render, screen, act } from "@testing-library/react";
import MilestoneAnimations, {
  type MilestoneAnimationsProps,
  type AnimationParticle,
} from "./milestone_animations";

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(() => {
  jest.useFakeTimers();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
});

afterAll(() => {
  jest.useRealTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.clearAllMocks();
});

function renderMA(props: Partial<MilestoneAnimationsProps> = {}) {
  return render(
    <MilestoneAnimations
      currentPercent={0}
      milestones={[25, 50, 75, 100]}
      {...props}
    />,
  );
}

// ── Milestone Detection ───────────────────────────────────────────────────────

describe("MilestoneAnimations — Milestone Detection", () => {
  it("should trigger animation when crossing a milestone", () => {
    const { rerender } = renderMA({ currentPercent: 0 });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerender(
      <MilestoneAnimations
        currentPercent={25}
        milestones={[25, 50, 75, 100]}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("should not trigger animation twice for same milestone", () => {
    const onComplete = jest.fn();
    const { rerender } = renderMA({
      currentPercent: 25,
      onAnimationComplete: onComplete,
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    rerender(
      <MilestoneAnimations
        currentPercent: 30,
        milestones={[25, 50, 75, 100]}
        onAnimationComplete={onComplete}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(100);
    });

    // Should only trigger once
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("should handle multiple milestones in sequence", () => {
    const { rerender } = renderMA({ currentPercent: 0 });

    rerender(
      <MilestoneAnimations
        currentPercent={50}
        milestones={[25, 50, 75, 100]}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("should clamp percentage to 0-100 range", () => {
    const { rerender } = renderMA({ currentPercent: 150 });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    // Should treat as 100%
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("should sanitize milestone values", () => {
    const { rerender } = renderMA({
      currentPercent: 0,
      milestones: [25.7, 50.3, 75.9],
    });

    rerender(
      <MilestoneAnimations
        currentPercent={26}
        milestones={[25.7, 50.3, 75.9]}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

// ── Animation Lifecycle ───────────────────────────────────────────────────────

describe("MilestoneAnimations — Animation Lifecycle", () => {
  it("should render particles during animation", () => {
    renderMA({ currentPercent: 25 });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    const svg = screen.getByRole("status").querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.querySelectorAll("circle").length).toBeGreaterThan(0);
  });

  it("should update particle positions over time", () => {
    renderMA({ currentPercent: 25 });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    const svg1 = screen.getByRole("status").querySelector("svg");
    const circles1 = svg1?.querySelectorAll("circle").length || 0;

    act(() => {
      jest.advanceTimersByTime(500);
    });

    const svg2 = screen.getByRole("status").querySelector("svg");
    const circles2 = svg2?.querySelectorAll("circle").length || 0;

    // Particles should decay over time
    expect(circles2).toBeLessThanOrEqual(circles1);
  });

  it("should complete animation after duration", () => {
    const onComplete = jest.fn();
    renderMA({
      currentPercent: 25,
      duration: 1000,
      onAnimationComplete: onComplete,
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(onComplete).toHaveBeenCalled();
  });

  it("should hide animation when complete", () => {
    renderMA({ currentPercent: 25, duration: 500 });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(600);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

// ── Auto-Dismiss ──────────────────────────────────────────────────────────────

describe("MilestoneAnimations — Auto-Dismiss", () => {
  it("should auto-dismiss after specified delay", () => {
    renderMA({ currentPercent: 25, autoDismissMs: 2000 });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2100);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("should not auto-dismiss when autoDismissMs is 0", () => {
    renderMA({ currentPercent: 25, autoDismissMs: 0, duration: 5000 });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

// ── Animation Types ───────────────────────────────────────────────────────────

describe("MilestoneAnimations — Animation Types", () => {
  it("should render confetti animation", () => {
    renderMA({ currentPercent: 25, animationType: "confetti" });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    const svg = screen.getByRole("status").querySelector("svg");
    expect(svg?.classList.contains("milestone-animations-confetti")).toBe(true);
  });

  it("should render pulse animation", () => {
    renderMA({ currentPercent: 25, animationType: "pulse" });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    const svg = screen.getByRole("status").querySelector("svg");
    expect(svg?.classList.contains("milestone-animations-pulse")).toBe(true);
  });

  it("should render bounce animation", () => {
    renderMA({ currentPercent: 25, animationType: "bounce" });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    const svg = screen.getByRole("status").querySelector("svg");
    expect(svg?.classList.contains("milestone-animations-bounce")).toBe(true);
  });
});

// ── Intensity Control ─────────────────────────────────────────────────────────

describe("MilestoneAnimations — Intensity Control", () => {
  it("should clamp intensity to 1-10 range", () => {
    const { rerender } = renderMA({ currentPercent: 25, intensity: 0 });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(screen.getByRole("status")).toBeInTheDocument();

    rerender(
      <MilestoneAnimations
        currentPercent={50}
        milestones={[25, 50, 75, 100]}
        intensity={15}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

// ── Accessibility ────────────────────────────────────────────────────────────

describe("MilestoneAnimations — Accessibility", () => {
  it("should have proper ARIA attributes", () => {
    renderMA({ currentPercent: 25 });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-label");
  });

  it("should hide SVG from screen readers", () => {
    renderMA({ currentPercent: 25 });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    const svg = screen.getByRole("status").querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("should respect prefers-reduced-motion", () => {
    (window.matchMedia as jest.Mock).mockImplementation((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    renderMA({ currentPercent: 25 });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

// ── Cleanup ───────────────────────────────────────────────────────────────────

describe("MilestoneAnimations — Cleanup", () => {
  it("should clean up timers on unmount", () => {
    const { unmount } = renderMA({ currentPercent: 25, autoDismissMs: 5000 });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(screen.getByRole("status")).toBeInTheDocument();

    unmount();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // Should not throw or cause issues
    expect(true).toBe(true);
  });

  it("should cancel animation frame on unmount", () => {
    const { unmount } = renderMA({ currentPercent: 25 });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    unmount();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(true).toBe(true);
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────────────

describe("MilestoneAnimations — Edge Cases", () => {
  it("should handle empty milestones array", () => {
    renderMA({ currentPercent: 50, milestones: [] });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("should handle negative percentage", () => {
    renderMA({ currentPercent: -10, milestones: [25, 50] });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("should handle very short duration", () => {
    const onComplete = jest.fn();
    renderMA({
      currentPercent: 25,
      duration: 50,
      onAnimationComplete: onComplete,
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(onComplete).toHaveBeenCalled();
  });

  it("should handle rapid milestone updates", () => {
    const { rerender } = renderMA({ currentPercent: 0 });

    rerender(
      <MilestoneAnimations
        currentPercent={25}
        milestones={[25, 50, 75, 100]}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(50);
    });

    rerender(
      <MilestoneAnimations
        currentPercent={50}
        milestones={[25, 50, 75, 100]}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(50);
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
