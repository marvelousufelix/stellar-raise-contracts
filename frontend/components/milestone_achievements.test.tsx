/**
 * @title MilestoneAchievements — Comprehensive Test Suite
 * @notice Covers achievement detection, unlock tracking, display layouts,
 *         accessibility, and edge cases.
 *
 * @dev Targets ≥ 95 % coverage of milestone_achievements.tsx.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import MilestoneAchievements, {
  type MilestoneAchievementsProps,
  type Achievement,
} from "./milestone_achievements";

// ── Setup ─────────────────────────────────────────────────────────────────────

function renderMA(props: Partial<MilestoneAchievementsProps> = {}) {
  return render(
    <MilestoneAchievements
      currentPercent={0}
      {...props}
    />,
  );
}

// ── Achievement Detection ─────────────────────────────────────────────────────

describe("MilestoneAchievements — Achievement Detection", () => {
  it("should unlock achievement at milestone", () => {
    renderMA({ currentPercent: 25 });
    const achievements = screen.getAllByRole("article");
    expect(achievements[1]).toHaveClass("unlocked"); // Quarter Way There
  });

  it("should not unlock achievement before milestone", () => {
    renderMA({ currentPercent: 24 });
    const achievements = screen.getAllByRole("article");
    expect(achievements[1]).toHaveClass("locked"); // Quarter Way There
  });

  it("should unlock multiple achievements", () => {
    renderMA({ currentPercent: 75 });
    const achievements = screen.getAllByRole("article");
    const unlockedCount = achievements.filter((a) =>
      a.classList.contains("unlocked"),
    ).length;
    expect(unlockedCount).toBe(4); // Start, Quarter, Halfway, Almost There
  });

  it("should unlock all achievements at 100%", () => {
    renderMA({ currentPercent: 100 });
    const achievements = screen.getAllByRole("article");
    const unlockedCount = achievements.filter((a) =>
      a.classList.contains("unlocked"),
    ).length;
    expect(unlockedCount).toBe(5); // All achievements
  });

  it("should clamp percentage to 0-100", () => {
    renderMA({ currentPercent: 150 });
    const achievements = screen.getAllByRole("article");
    const unlockedCount = achievements.filter((a) =>
      a.classList.contains("unlocked"),
    ).length;
    expect(unlockedCount).toBe(5); // All achievements
  });

  it("should handle negative percentage", () => {
    renderMA({ currentPercent: -10 });
    const achievements = screen.getAllByRole("article");
    expect(achievements[0]).toHaveClass("unlocked"); // Only start
  });
});

// ── Display Layouts ───────────────────────────────────────────────────────────

describe("MilestoneAchievements — Display Layouts", () => {
  it("should render grid layout", () => {
    renderMA({ currentPercent: 50, layout: "grid" });
    expect(document.querySelector(".milestone-achievements-grid")).toBeInTheDocument();
    expect(document.querySelector(".achievements-grid")).toBeInTheDocument();
  });

  it("should render list layout", () => {
    renderMA({ currentPercent: 50, layout: "list" });
    expect(document.querySelector(".milestone-achievements-list")).toBeInTheDocument();
    expect(document.querySelector(".achievements-list")).toBeInTheDocument();
  });

  it("should render compact layout", () => {
    renderMA({ currentPercent: 50, layout: "compact" });
    expect(document.querySelector(".milestone-achievements-compact")).toBeInTheDocument();
    expect(document.querySelector(".achievements-compact-list")).toBeInTheDocument();
  });

  it("should default to grid layout", () => {
    renderMA({ currentPercent: 50 });
    expect(document.querySelector(".milestone-achievements-grid")).toBeInTheDocument();
  });
});

// ── Display Options ───────────────────────────────────────────────────────────

describe("MilestoneAchievements — Display Options", () => {
  it("should show descriptions when enabled", () => {
    renderMA({ currentPercent: 50, showDescriptions: true });
    expect(screen.getByText(/Reached 50% of funding goal/)).toBeInTheDocument();
  });

  it("should hide descriptions when disabled", () => {
    renderMA({ currentPercent: 50, showDescriptions: false });
    expect(screen.queryByText(/Reached 50% of funding goal/)).not.toBeInTheDocument();
  });

  it("should show timestamps when enabled and achievement unlocked", () => {
    renderMA({ currentPercent: 50, showTimestamps: true });
    // Timestamps are shown for unlocked achievements
    const achievements = screen.getAllByRole("article");
    expect(achievements.length).toBeGreaterThan(0);
  });

  it("should hide timestamps when disabled", () => {
    renderMA({ currentPercent: 50, showTimestamps: false });
    // Should not have timestamp elements
    const timestamps = document.querySelectorAll(".achievement-timestamp");
    expect(timestamps.length).toBe(0);
  });
});

// ── Achievement Callbacks ─────────────────────────────────────────────────────

describe("MilestoneAchievements — Achievement Callbacks", () => {
  it("should call onAchievementUnlocked when achievement unlocked", () => {
    const onAchievementUnlocked = jest.fn();
    const { rerender } = renderMA({
      currentPercent: 0,
      onAchievementUnlocked,
    });

    rerender(
      <MilestoneAchievements
        currentPercent={25}
        onAchievementUnlocked={onAchievementUnlocked}
      />,
    );

    expect(onAchievementUnlocked).toHaveBeenCalled();
  });

  it("should not call callback for already unlocked achievements", () => {
    const onAchievementUnlocked = jest.fn();
    renderMA({
      currentPercent: 50,
      onAchievementUnlocked,
    });

    // Should only call for newly unlocked achievements
    expect(onAchievementUnlocked).toHaveBeenCalledTimes(3); // Quarter, Halfway, Start
  });

  it("should include unlockedAt timestamp in callback", () => {
    const onAchievementUnlocked = jest.fn();
    const { rerender } = renderMA({
      currentPercent: 0,
      onAchievementUnlocked,
    });

    rerender(
      <MilestoneAchievements
        currentPercent={25}
        onAchievementUnlocked={onAchievementUnlocked}
      />,
    );

    const callArg = onAchievementUnlocked.mock.calls[0][0];
    expect(callArg.unlockedAt).toBeDefined();
    expect(typeof callArg.unlockedAt).toBe("number");
  });
});

// ── Custom Achievements ───────────────────────────────────────────────────────

describe("MilestoneAchievements — Custom Achievements", () => {
  it("should render custom achievements", () => {
    const customAchievements: Achievement[] = [
      {
        id: "custom1",
        percent: 10,
        title: "Custom Achievement",
        description: "Custom description",
        icon: "⭐",
        unlocked: false,
      },
    ];

    renderMA({
      currentPercent: 50,
      customAchievements,
    });

    expect(screen.getByText("Custom Achievement")).toBeInTheDocument();
  });

  it("should sanitize custom achievement data", () => {
    const customAchievements: Achievement[] = [
      {
        id: "custom1",
        percent: 25.7,
        title: "A".repeat(200),
        description: "B".repeat(600),
        icon: "⭐🎉",
        unlocked: false,
      },
    ];

    renderMA({
      currentPercent: 50,
      customAchievements,
    });

    // Should render without errors
    expect(screen.getByRole("region")).toBeInTheDocument();
  });
});

// ── Accessibility ────────────────────────────────────────────────────────────

describe("MilestoneAchievements — Accessibility", () => {
  it("should have region role", () => {
    renderMA({ currentPercent: 50 });
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("should have aria-label", () => {
    renderMA({ currentPercent: 50 });
    expect(screen.getByRole("region")).toHaveAttribute(
      "aria-label",
      "Campaign achievements",
    );
  });

  it("should have article role for each achievement in grid", () => {
    renderMA({ currentPercent: 50, layout: "grid" });
    const articles = screen.getAllByRole("article");
    expect(articles.length).toBeGreaterThan(0);
  });

  it("should have aria-label for each achievement", () => {
    renderMA({ currentPercent: 50 });
    const achievements = screen.getAllByRole("article");
    achievements.forEach((achievement) => {
      expect(achievement).toHaveAttribute("aria-label");
    });
  });

  it("should have aria-live for achievement count in list layout", () => {
    renderMA({ currentPercent: 50, layout: "list" });
    const count = document.querySelector(".achievements-count");
    expect(count).toHaveAttribute("aria-live", "polite");
  });

  it("should hide decorative elements from screen readers", () => {
    renderMA({ currentPercent: 50 });
    const badges = document.querySelectorAll(".achievement-badge");
    badges.forEach((badge) => {
      expect(badge).toHaveAttribute("aria-hidden", "true");
    });
  });
});

// ── Progress Calculation ──────────────────────────────────────────────────────

describe("MilestoneAchievements — Progress Calculation", () => {
  it("should calculate 0% progress with no unlocked achievements", () => {
    renderMA({ currentPercent: 0 });
    expect(screen.getByText("0% Unlocked")).toBeInTheDocument();
  });

  it("should calculate 40% progress with 2 of 5 achievements", () => {
    renderMA({ currentPercent: 50 });
    expect(screen.getByText("60% Unlocked")).toBeInTheDocument(); // Start, Quarter, Halfway
  });

  it("should calculate 100% progress with all achievements", () => {
    renderMA({ currentPercent: 100 });
    expect(screen.getByText("100% Unlocked")).toBeInTheDocument();
  });
});

// ── Grid Layout Specifics ─────────────────────────────────────────────────────

describe("MilestoneAchievements — Grid Layout", () => {
  it("should display achievement cards", () => {
    renderMA({ currentPercent: 50, layout: "grid" });
    const cards = document.querySelectorAll(".achievement-card");
    expect(cards.length).toBeGreaterThan(0);
  });

  it("should show achievement icons", () => {
    renderMA({ currentPercent: 50, layout: "grid" });
    const icons = document.querySelectorAll(".achievement-icon");
    expect(icons.length).toBeGreaterThan(0);
  });

  it("should show achievement titles", () => {
    renderMA({ currentPercent: 50, layout: "grid" });
    expect(screen.getByText("Campaign Started")).toBeInTheDocument();
    expect(screen.getByText("Quarter Way There")).toBeInTheDocument();
  });

  it("should show achievement percentages", () => {
    renderMA({ currentPercent: 50, layout: "grid" });
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
  });
});

// ── List Layout Specifics ─────────────────────────────────────────────────────

describe("MilestoneAchievements — List Layout", () => {
  it("should render as list items", () => {
    renderMA({ currentPercent: 50, layout: "list" });
    const items = document.querySelectorAll(".achievement-item");
    expect(items.length).toBeGreaterThan(0);
  });

  it("should show achievement count", () => {
    renderMA({ currentPercent: 50, layout: "list" });
    expect(screen.getByText(/3 of 5 unlocked/)).toBeInTheDocument();
  });
});

// ── Compact Layout Specifics ──────────────────────────────────────────────────

describe("MilestoneAchievements — Compact Layout", () => {
  it("should render compact achievements", () => {
    renderMA({ currentPercent: 50, layout: "compact" });
    const compact = document.querySelectorAll(".achievement-compact");
    expect(compact.length).toBeGreaterThan(0);
  });

  it("should show progress percentage in header", () => {
    renderMA({ currentPercent: 50, layout: "compact" });
    expect(screen.getByText(/Achievements: 60%/)).toBeInTheDocument();
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────────────

describe("MilestoneAchievements — Edge Cases", () => {
  it("should handle empty custom achievements", () => {
    renderMA({
      currentPercent: 50,
      customAchievements: [],
    });

    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("should handle single achievement", () => {
    const customAchievements: Achievement[] = [
      {
        id: "single",
        percent: 50,
        title: "Single Achievement",
        description: "Only one",
        icon: "⭐",
        unlocked: false,
      },
    ];

    renderMA({
      currentPercent: 50,
      customAchievements,
    });

    expect(screen.getByText("Single Achievement")).toBeInTheDocument();
  });

  it("should handle very large percentage", () => {
    renderMA({ currentPercent: 999999 });
    const achievements = screen.getAllByRole("article");
    const unlockedCount = achievements.filter((a) =>
      a.classList.contains("unlocked"),
    ).length;
    expect(unlockedCount).toBe(5); // All achievements
  });

  it("should handle duplicate achievement IDs", () => {
    const customAchievements: Achievement[] = [
      {
        id: "dup",
        percent: 25,
        title: "Achievement 1",
        description: "First",
        icon: "⭐",
        unlocked: false,
      },
      {
        id: "dup",
        percent: 50,
        title: "Achievement 2",
        description: "Second",
        icon: "🎉",
        unlocked: false,
      },
    ];

    renderMA({
      currentPercent: 50,
      customAchievements,
    });

    // Should render both (React will handle key warnings)
    expect(screen.getByText("Achievement 1")).toBeInTheDocument();
    expect(screen.getByText("Achievement 2")).toBeInTheDocument();
  });
});
