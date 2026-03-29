/**
 * @title ProgressVisualization — Comprehensive Test Suite
 * @notice Covers progress calculation, milestone detection, display styles,
 *         accessibility, and edge cases.
 *
 * @dev Targets ≥ 95 % coverage of progress_visualization.tsx.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import ProgressVisualization, {
  type ProgressVisualizationProps,
} from "./progress_visualization";

// ── Setup ─────────────────────────────────────────────────────────────────────

function renderPV(props: Partial<ProgressVisualizationProps> = {}) {
  return render(
    <ProgressVisualization
      currentAmount={0}
      goalAmount={1000}
      {...props}
    />,
  );
}

// ── Progress Calculation ──────────────────────────────────────────────────────

describe("ProgressVisualization — Progress Calculation", () => {
  it("should calculate 0% progress when current is 0", () => {
    renderPV({ currentAmount: 0, goalAmount: 1000 });
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "0");
  });

  it("should calculate 50% progress at midpoint", () => {
    renderPV({ currentAmount: 500, goalAmount: 1000 });
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "50");
  });

  it("should calculate 100% progress when goal is met", () => {
    renderPV({ currentAmount: 1000, goalAmount: 1000 });
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "100");
  });

  it("should clamp progress to 100% when exceeded", () => {
    renderPV({ currentAmount: 1500, goalAmount: 1000 });
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "100");
  });

  it("should handle zero goal amount", () => {
    renderPV({ currentAmount: 100, goalAmount: 0 });
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "0");
  });

  it("should handle negative current amount", () => {
    renderPV({ currentAmount: -100, goalAmount: 1000 });
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "0");
  });
});

// ── Display Styles ────────────────────────────────────────────────────────────

describe("ProgressVisualization — Display Styles", () => {
  it("should render linear progress bar", () => {
    renderPV({ currentAmount: 500, goalAmount: 1000, displayStyle: "linear" });
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(document.querySelector(".progress-bar-fill")).toBeInTheDocument();
  });

  it("should render circular progress", () => {
    renderPV({ currentAmount: 500, goalAmount: 1000, displayStyle: "circular" });
    const svg = screen.getByRole("progressbar");
    expect(svg.tagName).toBe("svg");
    expect(svg.querySelector("circle")).toBeInTheDocument();
  });

  it("should render segmented progress", () => {
    renderPV({
      currentAmount: 500,
      goalAmount: 1000,
      displayStyle: "segmented",
    });
    expect(document.querySelector(".progress-segments")).toBeInTheDocument();
    expect(document.querySelectorAll(".progress-segment").length).toBeGreaterThan(
      0,
    );
  });

  it("should default to linear style", () => {
    renderPV({ currentAmount: 500, goalAmount: 1000 });
    expect(document.querySelector(".progress-bar-fill")).toBeInTheDocument();
  });
});

// ── Milestone Markers ─────────────────────────────────────────────────────────

describe("ProgressVisualization — Milestone Markers", () => {
  it("should display milestone markers", () => {
    renderPV({
      currentAmount: 500,
      goalAmount: 1000,
      milestones: [25, 50, 75, 100],
    });
    const markers = document.querySelectorAll(".milestone-marker");
    expect(markers.length).toBe(4);
  });

  it("should mark reached milestones", () => {
    renderPV({
      currentAmount: 750,
      goalAmount: 1000,
      milestones: [25, 50, 75, 100],
    });
    const markers = document.querySelectorAll(".milestone-marker.reached");
    expect(markers.length).toBe(3); // 25, 50, 75
  });

  it("should remove duplicate milestones", () => {
    renderPV({
      currentAmount: 500,
      goalAmount: 1000,
      milestones: [25, 50, 50, 75, 100],
    });
    const markers = document.querySelectorAll(".milestone-marker");
    expect(markers.length).toBe(4); // Duplicates removed
  });

  it("should sanitize milestone values", () => {
    renderPV({
      currentAmount: 500,
      goalAmount: 1000,
      milestones: [25.7, 50.3, 75.9],
    });
    const markers = document.querySelectorAll(".milestone-marker");
    expect(markers.length).toBe(3);
  });

  it("should clamp milestones to 0-100 range", () => {
    renderPV({
      currentAmount: 500,
      goalAmount: 1000,
      milestones: [-10, 50, 150],
    });
    const markers = document.querySelectorAll(".milestone-marker");
    expect(markers.length).toBe(2); // -10 clamped to 0, 150 clamped to 100
  });
});

// ── Display Options ───────────────────────────────────────────────────────────

describe("ProgressVisualization — Display Options", () => {
  it("should show percentage when enabled", () => {
    renderPV({
      currentAmount: 500,
      goalAmount: 1000,
      showPercentage: true,
    });
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("should hide percentage when disabled", () => {
    renderPV({
      currentAmount: 500,
      goalAmount: 1000,
      showPercentage: false,
    });
    expect(screen.queryByText("50%")).not.toBeInTheDocument();
  });

  it("should show amount when enabled", () => {
    renderPV({
      currentAmount: 500,
      goalAmount: 1000,
      showAmount: true,
      currencySymbol: "$",
    });
    expect(screen.getByText(/\$500 \/ \$1,000/)).toBeInTheDocument();
  });

  it("should hide amount when disabled", () => {
    renderPV({
      currentAmount: 500,
      goalAmount: 1000,
      showAmount: false,
    });
    expect(screen.queryByText(/\$500/)).not.toBeInTheDocument();
  });

  it("should use custom currency symbol", () => {
    renderPV({
      currentAmount: 500,
      goalAmount: 1000,
      showAmount: true,
      currencySymbol: "€",
    });
    expect(screen.getByText(/€500 \/ €1,000/)).toBeInTheDocument();
  });
});

// ── Accessibility ────────────────────────────────────────────────────────────

describe("ProgressVisualization — Accessibility", () => {
  it("should have progressbar role", () => {
    renderPV({ currentAmount: 500, goalAmount: 1000 });
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("should have aria-valuenow attribute", () => {
    renderPV({ currentAmount: 500, goalAmount: 1000 });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow");
  });

  it("should have aria-valuemin and aria-valuemax", () => {
    renderPV({ currentAmount: 500, goalAmount: 1000 });
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuemin", "0");
    expect(progressbar).toHaveAttribute("aria-valuemax", "100");
  });

  it("should have aria-label", () => {
    renderPV({
      currentAmount: 500,
      goalAmount: 1000,
      label: "Custom progress label",
    });
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-label",
      "Custom progress label",
    );
  });

  it("should have default aria-label", () => {
    renderPV({ currentAmount: 500, goalAmount: 1000 });
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-label",
      "Campaign funding progress",
    );
  });

  it("should have aria-describedby for milestones", () => {
    renderPV({
      currentAmount: 500,
      goalAmount: 1000,
      displayStyle: "linear",
    });
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-describedby");
  });
});

// ── Color Coding ──────────────────────────────────────────────────────────────

describe("ProgressVisualization — Color Coding", () => {
  it("should use red color for low progress", () => {
    renderPV({ currentAmount: 100, goalAmount: 1000 });
    const fill = document.querySelector(".progress-bar-fill") as HTMLElement;
    expect(fill?.style.backgroundColor).toBe("rgb(255, 107, 107)"); // #FF6B6B
  });

  it("should use orange color for medium progress", () => {
    renderPV({ currentAmount: 600, goalAmount: 1000 });
    const fill = document.querySelector(".progress-bar-fill") as HTMLElement;
    expect(fill?.style.backgroundColor).toBe("rgb(255, 160, 122)"); // #FFA07A
  });

  it("should use teal color for high progress", () => {
    renderPV({ currentAmount: 800, goalAmount: 1000 });
    const fill = document.querySelector(".progress-bar-fill") as HTMLElement;
    expect(fill?.style.backgroundColor).toBe("rgb(78, 205, 196)"); // #4ECDC4
  });

  it("should use green color for complete progress", () => {
    renderPV({ currentAmount: 1000, goalAmount: 1000 });
    const fill = document.querySelector(".progress-bar-fill") as HTMLElement;
    expect(fill?.style.backgroundColor).toBe("rgb(46, 204, 113)"); // #2ECC71
  });
});

// ── Callbacks ─────────────────────────────────────────────────────────────────

describe("ProgressVisualization — Callbacks", () => {
  it("should call onProgressChange with correct percentage", () => {
    const onProgressChange = jest.fn();
    renderPV({
      currentAmount: 500,
      goalAmount: 1000,
      onProgressChange,
    });
    expect(onProgressChange).toHaveBeenCalledWith(50);
  });

  it("should call onProgressChange on update", () => {
    const onProgressChange = jest.fn();
    const { rerender } = renderPV({
      currentAmount: 500,
      goalAmount: 1000,
      onProgressChange,
    });

    rerender(
      <ProgressVisualization
        currentAmount={750}
        goalAmount={1000}
        onProgressChange={onProgressChange}
      />,
    );

    expect(onProgressChange).toHaveBeenCalledWith(75);
  });
});

// ── Circular Progress ─────────────────────────────────────────────────────────

describe("ProgressVisualization — Circular Progress", () => {
  it("should render SVG circles", () => {
    renderPV({ currentAmount: 500, goalAmount: 1000, displayStyle: "circular" });
    const circles = document.querySelectorAll("circle");
    expect(circles.length).toBe(2); // Background and fill
  });

  it("should display percentage in circular progress", () => {
    renderPV({ currentAmount: 500, goalAmount: 1000, displayStyle: "circular" });
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("should update stroke-dashoffset for circular progress", () => {
    renderPV({ currentAmount: 500, goalAmount: 1000, displayStyle: "circular" });
    const fillCircle = document.querySelector(".progress-circle-fill");
    expect(fillCircle).toHaveStyle("stroke-dashoffset");
  });
});

// ── Segmented Progress ────────────────────────────────────────────────────────

describe("ProgressVisualization — Segmented Progress", () => {
  it("should render 10 segments", () => {
    renderPV({
      currentAmount: 500,
      goalAmount: 1000,
      displayStyle: "segmented",
    });
    const segments = document.querySelectorAll(".progress-segment");
    expect(segments.length).toBe(10);
  });

  it("should fill correct number of segments", () => {
    renderPV({
      currentAmount: 500,
      goalAmount: 1000,
      displayStyle: "segmented",
    });
    const filledSegments = document.querySelectorAll(".progress-segment.filled");
    expect(filledSegments.length).toBe(5); // 50% = 5 segments
  });

  it("should update filled segments on progress change", () => {
    const { rerender } = renderPV({
      currentAmount: 250,
      goalAmount: 1000,
      displayStyle: "segmented",
    });

    let filledSegments = document.querySelectorAll(".progress-segment.filled");
    expect(filledSegments.length).toBe(3); // 25% ≈ 3 segments

    rerender(
      <ProgressVisualization
        currentAmount={750}
        goalAmount={1000}
        displayStyle="segmented"
      />,
    );

    filledSegments = document.querySelectorAll(".progress-segment.filled");
    expect(filledSegments.length).toBe(8); // 75% ≈ 8 segments
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────────────

describe("ProgressVisualization — Edge Cases", () => {
  it("should handle very large amounts", () => {
    renderPV({ currentAmount: 1000000, goalAmount: 1000000 });
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "100");
  });

  it("should handle very small amounts", () => {
    renderPV({ currentAmount: 0.01, goalAmount: 1000 });
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "0");
  });

  it("should handle empty milestones array", () => {
    renderPV({
      currentAmount: 500,
      goalAmount: 1000,
      milestones: [],
    });
    const markers = document.querySelectorAll(".milestone-marker");
    expect(markers.length).toBe(0);
  });

  it("should handle single milestone", () => {
    renderPV({
      currentAmount: 500,
      goalAmount: 1000,
      milestones: [50],
    });
    const markers = document.querySelectorAll(".milestone-marker");
    expect(markers.length).toBe(1);
  });
});
