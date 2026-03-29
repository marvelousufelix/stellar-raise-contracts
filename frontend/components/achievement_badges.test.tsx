/**
 * @title AchievementBadges — Comprehensive Test Suite
 * @notice Covers badge detection, unlock tracking, display layouts,
 *         accessibility, callbacks, and edge cases.
 *
 * @dev Targets ≥ 95% coverage of achievement_badges.tsx.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import AchievementBadges, {
  type AchievementBadgesProps,
  type Badge,
} from "./achievement_badges";

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderAB(props: Partial<AchievementBadgesProps> = {}) {
  return render(<AchievementBadges currentPercent={0} {...props} />);
}

// ── Badge Detection ───────────────────────────────────────────────────────────

describe("AchievementBadges — Badge Detection", () => {
  it("unlocks badge at exact milestone", () => {
    renderAB({ currentPercent: 25 });
    const badges = screen.getAllByRole("article");
    expect(badges[1]).toHaveClass("unlocked");
  });

  it("does not unlock badge before milestone", () => {
    renderAB({ currentPercent: 24 });
    const badges = screen.getAllByRole("article");
    expect(badges[1]).toHaveClass("locked");
  });

  it("unlocks multiple badges", () => {
    renderAB({ currentPercent: 75 });
    const badges = screen.getAllByRole("article");
    const unlocked = badges.filter((b) => b.classList.contains("unlocked")).length;
    expect(unlocked).toBe(4);
  });

  it("unlocks all badges at 100%", () => {
    renderAB({ currentPercent: 100 });
    const badges = screen.getAllByRole("article");
    const unlocked = badges.filter((b) => b.classList.contains("unlocked")).length;
    expect(unlocked).toBe(5);
  });

  it("clamps percentage above 100", () => {
    renderAB({ currentPercent: 200 });
    const badges = screen.getAllByRole("article");
    const unlocked = badges.filter((b) => b.classList.contains("unlocked")).length;
    expect(unlocked).toBe(5);
  });

  it("handles negative percentage", () => {
    renderAB({ currentPercent: -10 });
    const badges = screen.getAllByRole("article");
    expect(badges[0]).toHaveClass("unlocked"); // launch badge at 0%
  });
});

// ── Display Layouts ───────────────────────────────────────────────────────────

describe("AchievementBadges — Display Layouts", () => {
  it("renders grid layout by default", () => {
    renderAB({ currentPercent: 50 });
    expect(document.querySelector(".achievement-badges-grid")).toBeInTheDocument();
  });

  it("renders grid layout explicitly", () => {
    renderAB({ currentPercent: 50, layout: "grid" });
    expect(document.querySelector(".badges-grid")).toBeInTheDocument();
  });

  it("renders list layout", () => {
    renderAB({ currentPercent: 50, layout: "list" });
    expect(document.querySelector(".achievement-badges-list")).toBeInTheDocument();
    expect(document.querySelector(".badges-list")).toBeInTheDocument();
  });

  it("renders compact layout", () => {
    renderAB({ currentPercent: 50, layout: "compact" });
    expect(document.querySelector(".achievement-badges-compact")).toBeInTheDocument();
    expect(document.querySelector(".badges-compact-list")).toBeInTheDocument();
  });
});

// ── Display Options ───────────────────────────────────────────────────────────

describe("AchievementBadges — Display Options", () => {
  it("shows descriptions when enabled", () => {
    renderAB({ currentPercent: 50, showDescriptions: true });
    expect(screen.getByText("Reached 50% of funding goal")).toBeInTheDocument();
  });

  it("hides descriptions when disabled", () => {
    renderAB({ currentPercent: 50, showDescriptions: false });
    expect(screen.queryByText("Reached 50% of funding goal")).not.toBeInTheDocument();
  });

  it("hides timestamps when disabled", () => {
    renderAB({ currentPercent: 50, showTimestamps: false });
    expect(document.querySelectorAll(".badge-timestamp").length).toBe(0);
  });
});

// ── Progress Calculation ──────────────────────────────────────────────────────

describe("AchievementBadges — Progress Calculation", () => {
  it("shows 0% unlocked at 0% progress", () => {
    renderAB({ currentPercent: 0 });
    expect(screen.getByText("0% Unlocked")).toBeInTheDocument();
  });

  it("shows 100% unlocked at 100% progress", () => {
    renderAB({ currentPercent: 100 });
    expect(screen.getByText("100% Unlocked")).toBeInTheDocument();
  });
});

// ── Callbacks ─────────────────────────────────────────────────────────────────

describe("AchievementBadges — Callbacks", () => {
  it("calls onBadgeUnlocked when badge unlocked", () => {
    const onBadgeUnlocked = jest.fn();
    const { rerender } = renderAB({ currentPercent: 0, onBadgeUnlocked });
    rerender(<AchievementBadges currentPercent={25} onBadgeUnlocked={onBadgeUnlocked} />);
    expect(onBadgeUnlocked).toHaveBeenCalled();
  });

  it("includes unlockedAt timestamp in callback", () => {
    const onBadgeUnlocked = jest.fn();
    const { rerender } = renderAB({ currentPercent: 0, onBadgeUnlocked });
    rerender(<AchievementBadges currentPercent={25} onBadgeUnlocked={onBadgeUnlocked} />);
    const arg = onBadgeUnlocked.mock.calls[0][0];
    expect(typeof arg.unlockedAt).toBe("number");
  });

  it("does not re-fire for already-unlocked badges", () => {
    const onBadgeUnlocked = jest.fn();
    renderAB({ currentPercent: 50, onBadgeUnlocked });
    const firstCallCount = onBadgeUnlocked.mock.calls.length;
    // Re-render with same percent — no new unlocks.
    const { rerender } = renderAB({ currentPercent: 50, onBadgeUnlocked });
    rerender(<AchievementBadges currentPercent={50} onBadgeUnlocked={onBadgeUnlocked} />);
    expect(onBadgeUnlocked.mock.calls.length).toBe(firstCallCount);
  });
});

// ── Custom Badges ─────────────────────────────────────────────────────────────

describe("AchievementBadges — Custom Badges", () => {
  it("renders custom badges", () => {
    const customBadges: Badge[] = [
      { id: "c1", percent: 10, title: "Custom Badge", description: "Custom desc", icon: "⭐", unlocked: false },
    ];
    renderAB({ currentPercent: 50, customBadges });
    expect(screen.getByText("Custom Badge")).toBeInTheDocument();
  });

  it("sanitizes long title and description", () => {
    const customBadges: Badge[] = [
      { id: "c1", percent: 10, title: "A".repeat(200), description: "B".repeat(600), icon: "⭐", unlocked: false },
    ];
    renderAB({ currentPercent: 50, customBadges });
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("handles empty custom badges array", () => {
    renderAB({ currentPercent: 50, customBadges: [] });
    expect(screen.getByRole("region")).toBeInTheDocument();
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe("AchievementBadges — Accessibility", () => {
  it("has region role", () => {
    renderAB({ currentPercent: 50 });
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("has aria-label on region", () => {
    renderAB({ currentPercent: 50 });
    expect(screen.getByRole("region")).toHaveAttribute("aria-label", "Campaign achievement badges");
  });

  it("each badge has aria-label", () => {
    renderAB({ currentPercent: 50 });
    screen.getAllByRole("article").forEach((b) => {
      expect(b).toHaveAttribute("aria-label");
    });
  });

  it("badge icons are aria-hidden", () => {
    renderAB({ currentPercent: 50 });
    document.querySelectorAll(".badge-icon").forEach((icon) => {
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("list layout has aria-live on count", () => {
    renderAB({ currentPercent: 50, layout: "list" });
    expect(document.querySelector(".badges-count")).toHaveAttribute("aria-live", "polite");
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────────────

describe("AchievementBadges — Edge Cases", () => {
  it("handles very large percentage", () => {
    renderAB({ currentPercent: 999999 });
    const badges = screen.getAllByRole("article");
    expect(badges.filter((b) => b.classList.contains("unlocked")).length).toBe(5);
  });

  it("handles NaN percentage", () => {
    renderAB({ currentPercent: NaN });
    expect(screen.getByRole("region")).toBeInTheDocument();
  });
});
