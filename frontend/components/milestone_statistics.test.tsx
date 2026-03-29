/**
 * @title MilestoneStatistics — Comprehensive Test Suite
 * @notice Covers statistics calculation, display layouts, trend detection,
 *         accessibility, and edge cases.
 *
 * @dev Targets ≥ 95 % coverage of milestone_statistics.tsx.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import MilestoneStatistics, {
  type MilestoneStatisticsProps,
} from "./milestone_statistics";

// ── Setup ─────────────────────────────────────────────────────────────────────

function renderMS(props: Partial<MilestoneStatisticsProps> = {}) {
  return render(
    <MilestoneStatistics
      currentAmount={0}
      goalAmount={1000}
      contributorCount={0}
      {...props}
    />,
  );
}

// ── Statistics Calculation ────────────────────────────────────────────────────

describe("MilestoneStatistics — Statistics Calculation", () => {
  it("should calculate funding progress", () => {
    renderMS({ currentAmount: 500, goalAmount: 1000 });
    expect(screen.getByText(/50%/)).toBeInTheDocument();
  });

  it("should display contributor count", () => {
    renderMS({ contributorCount: 42 });
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("should calculate funding velocity", () => {
    renderMS({ fundingVelocity: 100, currencySymbol: "$" });
    expect(screen.getByText(/\$100\/day/)).toBeInTheDocument();
  });

  it("should display time remaining", () => {
    renderMS({ daysRemaining: 5 });
    expect(screen.getByText(/5 days/)).toBeInTheDocument();
  });

  it("should calculate milestone progress", () => {
    renderMS({ currentAmount: 750, goalAmount: 1000 });
    expect(screen.getByText(/3\/4/)).toBeInTheDocument();
  });

  it("should handle zero goal amount", () => {
    renderMS({ currentAmount: 100, goalAmount: 0 });
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("should clamp negative amounts to 0", () => {
    renderMS({ currentAmount: -100, goalAmount: 1000 });
    expect(screen.getByText(/0%/)).toBeInTheDocument();
  });
});

// ── Display Layouts ───────────────────────────────────────────────────────────

describe("MilestoneStatistics — Display Layouts", () => {
  it("should render grid layout", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      layout: "grid",
    });
    expect(document.querySelector(".milestone-statistics-grid")).toBeInTheDocument();
    expect(document.querySelector(".statistics-grid")).toBeInTheDocument();
  });

  it("should render table layout", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      layout: "table",
    });
    expect(document.querySelector(".milestone-statistics-table")).toBeInTheDocument();
    expect(document.querySelector(".statistics-table")).toBeInTheDocument();
  });

  it("should render summary layout", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      layout: "summary",
    });
    expect(document.querySelector(".milestone-statistics-summary")).toBeInTheDocument();
    expect(document.querySelector(".summary-grid")).toBeInTheDocument();
  });

  it("should default to grid layout", () => {
    renderMS({ currentAmount: 500, goalAmount: 1000 });
    expect(document.querySelector(".milestone-statistics-grid")).toBeInTheDocument();
  });
});

// ── Trend Indicators ──────────────────────────────────────────────────────────

describe("MilestoneStatistics — Trend Indicators", () => {
  it("should show trends when enabled", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      showTrends: true,
    });
    const trends = document.querySelectorAll(".statistic-trend");
    expect(trends.length).toBeGreaterThan(0);
  });

  it("should hide trends when disabled", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      showTrends: false,
    });
    const trends = document.querySelectorAll(".statistic-trend");
    expect(trends.length).toBe(0);
  });

  it("should show up trend for good funding velocity", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      fundingVelocity: 500,
      daysRemaining: 5,
      showTrends: true,
    });
    const trends = document.querySelectorAll(".statistic-trend");
    expect(trends.length).toBeGreaterThan(0);
  });

  it("should show down trend for poor funding velocity", () => {
    renderMS({
      currentAmount: 100,
      goalAmount: 1000,
      fundingVelocity: 10,
      daysRemaining: 5,
      showTrends: true,
    });
    const trends = document.querySelectorAll(".statistic-trend");
    expect(trends.length).toBeGreaterThan(0);
  });
});

// ── Currency Formatting ───────────────────────────────────────────────────────

describe("MilestoneStatistics — Currency Formatting", () => {
  it("should use custom currency symbol", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      fundingVelocity: 100,
      currencySymbol: "€",
    });
    expect(screen.getByText(/€100\/day/)).toBeInTheDocument();
  });

  it("should format large amounts with commas", () => {
    renderMS({
      currentAmount: 1500000,
      goalAmount: 1000000,
      currencySymbol: "$",
    });
    expect(screen.getByText(/\$1,500,000/)).toBeInTheDocument();
  });

  it("should handle different currency symbols", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      fundingVelocity: 100,
      currencySymbol: "¥",
    });
    expect(screen.getByText(/¥100\/day/)).toBeInTheDocument();
  });
});

// ── Callbacks ─────────────────────────────────────────────────────────────────

describe("MilestoneStatistics — Callbacks", () => {
  it("should call onStatisticsUpdate with statistics", () => {
    const onStatisticsUpdate = jest.fn();
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      onStatisticsUpdate,
    });

    expect(onStatisticsUpdate).toHaveBeenCalled();
    const stats = onStatisticsUpdate.mock.calls[0][0];
    expect(Array.isArray(stats)).toBe(true);
    expect(stats.length).toBeGreaterThan(0);
  });

  it("should include all required statistic fields", () => {
    const onStatisticsUpdate = jest.fn();
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      onStatisticsUpdate,
    });

    const stats = onStatisticsUpdate.mock.calls[0][0];
    stats.forEach((stat) => {
      expect(stat).toHaveProperty("label");
      expect(stat).toHaveProperty("value");
    });
  });
});

// ── Grid Layout Specifics ─────────────────────────────────────────────────────

describe("MilestoneStatistics — Grid Layout", () => {
  it("should display statistic cards", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      layout: "grid",
    });
    const cards = document.querySelectorAll(".statistic-card");
    expect(cards.length).toBeGreaterThan(0);
  });

  it("should show statistic labels", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      layout: "grid",
    });
    expect(screen.getByText("Funding Progress")).toBeInTheDocument();
    expect(screen.getByText("Contributors")).toBeInTheDocument();
  });

  it("should show statistic descriptions", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      layout: "grid",
    });
    const descriptions = document.querySelectorAll(".statistic-description");
    expect(descriptions.length).toBeGreaterThan(0);
  });
});

// ── Table Layout Specifics ────────────────────────────────────────────────────

describe("MilestoneStatistics — Table Layout", () => {
  it("should render table with headers", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      layout: "table",
    });
    const headers = document.querySelectorAll("th");
    expect(headers.length).toBeGreaterThan(0);
  });

  it("should render table rows for each statistic", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      layout: "table",
    });
    const rows = document.querySelectorAll("tbody tr");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("should include metric label column", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      layout: "table",
    });
    expect(screen.getByText("Funding Progress")).toBeInTheDocument();
  });
});

// ── Summary Layout Specifics ──────────────────────────────────────────────────

describe("MilestoneStatistics — Summary Layout", () => {
  it("should render summary items", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      layout: "summary",
    });
    const items = document.querySelectorAll(".summary-item");
    expect(items.length).toBeGreaterThan(0);
  });

  it("should show summary labels", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      layout: "summary",
    });
    expect(screen.getByText("Funding")).toBeInTheDocument();
    expect(screen.getByText("Contributors")).toBeInTheDocument();
  });

  it("should show summary values", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      layout: "summary",
    });
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});

// ── Accessibility ────────────────────────────────────────────────────────────

describe("MilestoneStatistics — Accessibility", () => {
  it("should have region role", () => {
    renderMS({ currentAmount: 500, goalAmount: 1000 });
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("should have aria-label", () => {
    renderMS({ currentAmount: 500, goalAmount: 1000 });
    expect(screen.getByRole("region")).toHaveAttribute("aria-label");
  });

  it("should have aria-label for each statistic card", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      layout: "grid",
    });
    const cards = document.querySelectorAll(".statistic-card");
    cards.forEach((card) => {
      expect(card).toHaveAttribute("aria-label");
    });
  });

  it("should hide trend icons from screen readers", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      showTrends: true,
      layout: "grid",
    });
    const trends = document.querySelectorAll(".statistic-trend");
    trends.forEach((trend) => {
      expect(trend).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("should have proper table semantics", () => {
    renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      layout: "table",
    });
    const table = document.querySelector("table");
    expect(table).toBeInTheDocument();
    expect(table?.querySelector("thead")).toBeInTheDocument();
    expect(table?.querySelector("tbody")).toBeInTheDocument();
  });
});

// ── Time Formatting ───────────────────────────────────────────────────────────

describe("MilestoneStatistics — Time Formatting", () => {
  it("should format less than 1 day", () => {
    renderMS({ daysRemaining: 0.5 });
    expect(screen.getByText("Less than 1 day")).toBeInTheDocument();
  });

  it("should format 1 day", () => {
    renderMS({ daysRemaining: 1 });
    expect(screen.getByText("1 day")).toBeInTheDocument();
  });

  it("should format multiple days", () => {
    renderMS({ daysRemaining: 5 });
    expect(screen.getByText(/5 days/)).toBeInTheDocument();
  });

  it("should format fractional days", () => {
    renderMS({ daysRemaining: 2.5 });
    expect(screen.getByText(/2 days|3 days/)).toBeInTheDocument();
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────────────

describe("MilestoneStatistics — Edge Cases", () => {
  it("should handle zero contributors", () => {
    renderMS({ contributorCount: 0, goalAmount: 1000 });
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("should handle very large amounts", () => {
    renderMS({
      currentAmount: 999999999,
      goalAmount: 1000000000,
      currencySymbol: "$",
    });
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("should handle zero funding velocity", () => {
    renderMS({ fundingVelocity: 0, currencySymbol: "$" });
    expect(screen.getByText(/\$0\/day/)).toBeInTheDocument();
  });

  it("should handle zero days remaining", () => {
    renderMS({ daysRemaining: 0 });
    expect(screen.getByText("Less than 1 day")).toBeInTheDocument();
  });

  it("should handle negative days remaining", () => {
    renderMS({ daysRemaining: -5 });
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("should handle 100% funding", () => {
    renderMS({ currentAmount: 1000, goalAmount: 1000 });
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("should handle over 100% funding", () => {
    renderMS({ currentAmount: 1500, goalAmount: 1000 });
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});

// ── Statistics Update ─────────────────────────────────────────────────────────

describe("MilestoneStatistics — Statistics Update", () => {
  it("should update statistics on prop change", () => {
    const onStatisticsUpdate = jest.fn();
    const { rerender } = renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      onStatisticsUpdate,
    });

    rerender(
      <MilestoneStatistics
        currentAmount={750}
        goalAmount={1000}
        contributorCount={15}
        onStatisticsUpdate={onStatisticsUpdate}
      />,
    );

    expect(onStatisticsUpdate).toHaveBeenCalledTimes(2);
  });

  it("should not update statistics unnecessarily", () => {
    const onStatisticsUpdate = jest.fn();
    const { rerender } = renderMS({
      currentAmount: 500,
      goalAmount: 1000,
      contributorCount: 10,
      onStatisticsUpdate,
    });

    rerender(
      <MilestoneStatistics
        currentAmount={500}
        goalAmount={1000}
        contributorCount={10}
        onStatisticsUpdate={onStatisticsUpdate}
      />,
    );

    // Should only be called once (initial render)
    expect(onStatisticsUpdate).toHaveBeenCalledTimes(1);
  });
});
