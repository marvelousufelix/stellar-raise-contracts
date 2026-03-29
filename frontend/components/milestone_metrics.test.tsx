/**
 * @title MilestoneMetrics — Comprehensive Test Suite
 * @notice Covers metric computation, display layouts, callbacks, accessibility,
 *         and edge cases.
 *
 * @dev Targets ≥ 95% coverage of milestone_metrics.tsx.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import MilestoneMetrics, {
  clampPercent,
  computeMetricsSummary,
  formatDuration,
  isValidEvent,
  type MilestoneEvent,
  type MilestoneMetricsProps,
} from "./milestone_metrics";

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderMM(props: Partial<MilestoneMetricsProps> = {}) {
  return render(<MilestoneMetrics currentPercent={0} {...props} />);
}

function makeEvent(threshold: MilestoneEvent["threshold"], reachedAt: number, totalRaised = 1000, contributorCount = 10): MilestoneEvent {
  return { threshold, reachedAt, totalRaised, contributorCount };
}

// ── clampPercent ──────────────────────────────────────────────────────────────

describe("clampPercent", () => {
  it("clamps below 0 to 0", () => expect(clampPercent(-5)).toBe(0));
  it("clamps above 100 to 100", () => expect(clampPercent(150)).toBe(100));
  it("passes through valid value", () => expect(clampPercent(75)).toBe(75));
  it("handles NaN", () => expect(clampPercent(NaN)).toBe(0));
  it("handles non-number", () => expect(clampPercent("x" as unknown as number)).toBe(0));
});

// ── isValidEvent ──────────────────────────────────────────────────────────────

describe("isValidEvent", () => {
  it("accepts valid event", () => {
    expect(isValidEvent(makeEvent(25, Date.now()))).toBe(true);
  });

  it("rejects invalid threshold", () => {
    expect(isValidEvent({ threshold: 30 as MilestoneEvent["threshold"], reachedAt: 1000, totalRaised: 100, contributorCount: 1 })).toBe(false);
  });

  it("rejects zero timestamp", () => {
    expect(isValidEvent(makeEvent(25, 0))).toBe(false);
  });

  it("rejects negative timestamp", () => {
    expect(isValidEvent(makeEvent(25, -1))).toBe(false);
  });

  it("rejects negative totalRaised", () => {
    expect(isValidEvent({ threshold: 25, reachedAt: 1000, totalRaised: -1, contributorCount: 1 })).toBe(false);
  });

  it("rejects negative contributorCount", () => {
    expect(isValidEvent({ threshold: 25, reachedAt: 1000, totalRaised: 100, contributorCount: -1 })).toBe(false);
  });

  it("rejects non-integer contributorCount", () => {
    expect(isValidEvent({ threshold: 25, reachedAt: 1000, totalRaised: 100, contributorCount: 1.5 })).toBe(false);
  });
});

// ── computeMetricsSummary ─────────────────────────────────────────────────────

describe("computeMetricsSummary", () => {
  it("returns zeros for empty history", () => {
    const s = computeMetricsSummary([]);
    expect(s.milestonesReached).toBe(0);
    expect(s.avgTimeBetweenMs).toBe(0);
    expect(s.fastestIntervalMs).toBe(0);
    expect(s.latestTotalRaised).toBe(0);
    expect(s.avgRaisedPerMilestone).toBe(0);
  });

  it("handles single event", () => {
    const s = computeMetricsSummary([makeEvent(25, 1000, 500)]);
    expect(s.milestonesReached).toBe(1);
    expect(s.avgTimeBetweenMs).toBe(0);
    expect(s.fastestIntervalMs).toBe(0);
    expect(s.latestTotalRaised).toBe(500);
  });

  it("computes avg time between two events", () => {
    const events = [makeEvent(25, 1000), makeEvent(50, 3000)];
    const s = computeMetricsSummary(events);
    expect(s.avgTimeBetweenMs).toBe(2000);
    expect(s.fastestIntervalMs).toBe(2000);
  });

  it("finds fastest interval among multiple events", () => {
    const events = [
      makeEvent(25, 1000),
      makeEvent(50, 3000),  // 2000ms gap
      makeEvent(75, 3500),  // 500ms gap (fastest)
      makeEvent(100, 6000), // 2500ms gap
    ];
    const s = computeMetricsSummary(events);
    expect(s.fastestIntervalMs).toBe(500);
  });

  it("filters invalid events", () => {
    const events = [
      makeEvent(25, 1000),
      { threshold: 30 as MilestoneEvent["threshold"], reachedAt: 2000, totalRaised: 100, contributorCount: 1 },
    ];
    const s = computeMetricsSummary(events);
    expect(s.milestonesReached).toBe(1);
  });

  it("caps history at MAX_HISTORY_ENTRIES", () => {
    const events = Array.from({ length: 150 }, (_, i) =>
      makeEvent(25, 1000 + i * 100)
    );
    const s = computeMetricsSummary(events);
    expect(s.milestonesReached).toBeLessThanOrEqual(100);
  });
});

// ── formatDuration ────────────────────────────────────────────────────────────

describe("formatDuration", () => {
  it("returns — for 0ms", () => expect(formatDuration(0)).toBe("—"));
  it("returns — for negative", () => expect(formatDuration(-100)).toBe("—"));
  it("formats seconds", () => expect(formatDuration(30_000)).toBe("30s"));
  it("formats minutes and seconds", () => expect(formatDuration(90_000)).toBe("1m 30s"));
  it("formats hours and minutes", () => expect(formatDuration(3_660_000)).toBe("1h 1m"));
});

// ── Rendering — Summary Layout ────────────────────────────────────────────────

describe("MilestoneMetrics — Summary Layout", () => {
  it("renders summary layout by default", () => {
    renderMM();
    expect(document.querySelector(".milestone-metrics-summary")).toBeInTheDocument();
  });

  it("shows milestones reached", () => {
    renderMM({ milestoneHistory: [makeEvent(25, 1000)] });
    expect(screen.getByText("1/4")).toBeInTheDocument();
  });

  it("shows current progress", () => {
    renderMM({ currentPercent: 50 });
    expect(screen.getByText("50%")).toBeInTheDocument();
  });
});

// ── Rendering — Detailed Layout ───────────────────────────────────────────────

describe("MilestoneMetrics — Detailed Layout", () => {
  it("renders detailed layout", () => {
    renderMM({ layout: "detailed" });
    expect(document.querySelector(".milestone-metrics-detailed")).toBeInTheDocument();
  });

  it("shows milestone history section", () => {
    renderMM({ layout: "detailed" });
    expect(screen.getByText("Milestone History")).toBeInTheDocument();
  });

  it("shows empty state when no history", () => {
    renderMM({ layout: "detailed" });
    expect(screen.getByText("No milestones reached yet.")).toBeInTheDocument();
  });

  it("renders history items", () => {
    const history = [makeEvent(25, Date.now(), 500, 5)];
    renderMM({ layout: "detailed", milestoneHistory: history });
    expect(document.querySelector(".history-item")).toBeInTheDocument();
  });
});

// ── Rendering — Compact Layout ────────────────────────────────────────────────

describe("MilestoneMetrics — Compact Layout", () => {
  it("renders compact layout", () => {
    renderMM({ layout: "compact" });
    expect(document.querySelector(".milestone-metrics-compact")).toBeInTheDocument();
  });

  it("shows milestones count in compact", () => {
    renderMM({ layout: "compact", milestoneHistory: [makeEvent(25, 1000)] });
    expect(screen.getByText("Milestones: 1/4")).toBeInTheDocument();
  });
});

// ── Callbacks ─────────────────────────────────────────────────────────────────

describe("MilestoneMetrics — Callbacks", () => {
  it("calls onMetricRecorded when milestone count increases", () => {
    const onMetricRecorded = jest.fn();
    const { rerender } = renderMM({ milestoneHistory: [], onMetricRecorded });
    rerender(
      <MilestoneMetrics
        currentPercent={25}
        milestoneHistory={[makeEvent(25, 1000)]}
        onMetricRecorded={onMetricRecorded}
      />
    );
    expect(onMetricRecorded).toHaveBeenCalled();
  });

  it("passes summary to callback", () => {
    const onMetricRecorded = jest.fn();
    const { rerender } = renderMM({ milestoneHistory: [], onMetricRecorded });
    rerender(
      <MilestoneMetrics
        currentPercent={25}
        milestoneHistory={[makeEvent(25, 1000, 500)]}
        onMetricRecorded={onMetricRecorded}
      />
    );
    const arg = onMetricRecorded.mock.calls[0][0];
    expect(arg.milestonesReached).toBe(1);
    expect(arg.latestTotalRaised).toBe(500);
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe("MilestoneMetrics — Accessibility", () => {
  it("has region role", () => {
    renderMM();
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("has aria-label on region", () => {
    renderMM();
    expect(screen.getByRole("region")).toHaveAttribute("aria-label", "Campaign milestone metrics");
  });

  it("detailed layout has aria-live on metrics grid", () => {
    renderMM({ layout: "detailed" });
    expect(document.querySelector(".metrics-grid")).toHaveAttribute("aria-live", "polite");
  });

  it("summary layout has aria-live on metrics row", () => {
    renderMM({ layout: "summary" });
    expect(document.querySelector(".metrics-row")).toHaveAttribute("aria-live", "polite");
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────────────

describe("MilestoneMetrics — Edge Cases", () => {
  it("handles undefined milestoneHistory", () => {
    renderMM({ currentPercent: 50 });
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("handles very large totalRaised values", () => {
    const history = [makeEvent(100, 1000, Number.MAX_SAFE_INTEGER)];
    renderMM({ milestoneHistory: history });
    expect(screen.getByRole("region")).toBeInTheDocument();
  });
});
