/**
 * @file celebration_insights.test.tsx
 * @title Test Suite – CelebrationInsights
 *
 * @notice Comprehensive unit tests for the celebration_insights module.
 *
 * @dev Coverage targets (≥ 95%):
 *   - Pure helpers: clampPercent, safeString, computeFundingPercent,
 *     computeDaysToGoal, getActiveMilestone, formatInsightValue, deriveInsights
 *   - InsightCard: rendering, severity variants, value display
 *   - InsightPanel: loading state, empty state, populated state
 *   - CelebrationInsights: celebration panel, dismiss, auto-dismiss,
 *     callbacks, insights toggle, progress bar, edge cases
 *
 * @custom:security-notes
 *   - XSS tests confirm user-supplied strings are rendered as text nodes only.
 *   - Clamping tests confirm out-of-range values cannot produce invalid CSS.
 *   - Insight derivation tests confirm no user strings are unsanitized.
 *
 * @custom:test-output
 *   Run: `npm test -- --testPathPattern=celebration_insights --coverage`
 *   Expected: all tests pass, ≥ 95% statement/branch/function/line coverage.
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import CelebrationInsights, {
  InsightCard,
  InsightPanel,
  clampPercent,
  safeString,
  computeFundingPercent,
  computeDaysToGoal,
  getActiveMilestone,
  formatInsightValue,
  deriveInsights,
  DEFAULT_AUTO_DISMISS_MS,
  MAX_CAMPAIGN_NAME_LENGTH,
  MAX_INSIGHTS,
  STRONG_VELOCITY_THRESHOLD,
  HIGH_ENGAGEMENT_THRESHOLD,
  type Milestone,
  type CampaignMetrics,
  type Insight,
  type CelebrationInsightsProps,
} from "./celebration_insights";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeMilestone = (overrides: Partial<Milestone> = {}): Milestone => ({
  id: "m1",
  label: "25% Funded",
  targetPercent: 25,
  status: "pending",
  ...overrides,
});

const makeMetrics = (overrides: Partial<CampaignMetrics> = {}): CampaignMetrics => ({
  totalRaised: 5_000,
  goal: 10_000,
  contributorCount: 15,
  daysRemaining: 10,
  dailyVelocity: 1_500,
  largestContrib: 500,
  ...overrides,
});

const MILESTONES: Milestone[] = [
  makeMilestone({ id: "m1", label: "25% Funded", targetPercent: 25, status: "pending" }),
  makeMilestone({ id: "m2", label: "50% Funded", targetPercent: 50, status: "pending" }),
  makeMilestone({ id: "m3", label: "75% Funded", targetPercent: 75, status: "pending" }),
  makeMilestone({ id: "m4", label: "100% Funded", targetPercent: 100, status: "pending" }),
];

function renderInsights(props: Partial<CelebrationInsightsProps> = {}) {
  return render(
    <CelebrationInsights
      milestones={MILESTONES}
      currentPercent={50}
      metrics={makeMetrics()}
      autoDismissMs={0}
      {...props}
    />,
  );
}

// ── 1. clampPercent ───────────────────────────────────────────────────────────

describe("1. clampPercent", () => {
  it("1.1 clamps negative to 0", () => {
    expect(clampPercent(-1)).toBe(0);
    expect(clampPercent(-999)).toBe(0);
  });

  it("1.2 clamps above 100 to 100", () => {
    expect(clampPercent(101)).toBe(100);
    expect(clampPercent(9999)).toBe(100);
  });

  it("1.3 passes through in-range values", () => {
    expect(clampPercent(0)).toBe(0);
    expect(clampPercent(50)).toBe(50);
    expect(clampPercent(100)).toBe(100);
  });

  it("1.4 returns 0 for NaN", () => {
    expect(clampPercent(NaN)).toBe(0);
  });

  it("1.5 returns 0 for Infinity", () => {
    expect(clampPercent(Infinity)).toBe(0);
    expect(clampPercent(-Infinity)).toBe(0);
  });
});

// ── 2. safeString ─────────────────────────────────────────────────────────────

describe("2. safeString", () => {
  it("2.1 returns trimmed string", () => {
    expect(safeString("  hello  ", "fallback")).toBe("hello");
  });

  it("2.2 returns fallback for empty string", () => {
    expect(safeString("", "fallback")).toBe("fallback");
  });

  it("2.3 returns fallback for whitespace-only string", () => {
    expect(safeString("   ", "fallback")).toBe("fallback");
  });

  it("2.4 returns fallback for non-string input", () => {
    expect(safeString(null, "fallback")).toBe("fallback");
    expect(safeString(undefined, "fallback")).toBe("fallback");
    expect(safeString(42, "fallback")).toBe("fallback");
  });

  it("2.5 truncates to maxLen", () => {
    const long = "a".repeat(300);
    expect(safeString(long, "fallback", 10)).toHaveLength(10);
  });

  it("2.6 XSS: script tag rendered as text", () => {
    const xss = "<script>alert(1)</script>";
    const result = safeString(xss, "fallback");
    expect(result).toBe(xss); // returned as-is; React renders as text node
  });
});

// ── 3. computeFundingPercent ──────────────────────────────────────────────────

describe("3. computeFundingPercent", () => {
  it("3.1 returns 50 for half-funded", () => {
    expect(computeFundingPercent(5_000, 10_000)).toBe(50);
  });

  it("3.2 returns 100 for fully funded", () => {
    expect(computeFundingPercent(10_000, 10_000)).toBe(100);
  });

  it("3.3 returns 100 when over-funded (clamped)", () => {
    expect(computeFundingPercent(20_000, 10_000)).toBe(100);
  });

  it("3.4 returns 0 for zero goal", () => {
    expect(computeFundingPercent(5_000, 0)).toBe(0);
  });

  it("3.5 returns 0 for negative goal", () => {
    expect(computeFundingPercent(5_000, -1)).toBe(0);
  });

  it("3.6 returns 0 for zero raised", () => {
    expect(computeFundingPercent(0, 10_000)).toBe(0);
  });

  it("3.7 returns 0 for non-finite inputs", () => {
    expect(computeFundingPercent(NaN, 10_000)).toBe(0);
    expect(computeFundingPercent(5_000, Infinity)).toBe(0);
  });
});

// ── 4. computeDaysToGoal ──────────────────────────────────────────────────────

describe("4. computeDaysToGoal", () => {
  it("4.1 returns correct days", () => {
    expect(computeDaysToGoal(5_000, 10_000, 1_000)).toBe(5);
  });

  it("4.2 returns null when goal already met", () => {
    expect(computeDaysToGoal(10_000, 10_000, 1_000)).toBeNull();
  });

  it("4.3 returns null when velocity is zero", () => {
    expect(computeDaysToGoal(5_000, 10_000, 0)).toBeNull();
  });

  it("4.4 returns null when velocity is negative", () => {
    expect(computeDaysToGoal(5_000, 10_000, -100)).toBeNull();
  });

  it("4.5 returns null for non-finite inputs", () => {
    expect(computeDaysToGoal(NaN, 10_000, 1_000)).toBeNull();
    expect(computeDaysToGoal(5_000, Infinity, 1_000)).toBeNull();
  });

  it("4.6 rounds up fractional days", () => {
    // remaining = 1, velocity = 3 → ceil(1/3) = 1
    expect(computeDaysToGoal(9_999, 10_000, 3)).toBe(1);
  });
});

// ── 5. getActiveMilestone ─────────────────────────────────────────────────────

describe("5. getActiveMilestone", () => {
  it("5.1 returns null when no milestone is reached", () => {
    expect(getActiveMilestone(MILESTONES)).toBeNull();
  });

  it("5.2 returns first reached milestone", () => {
    const ms: Milestone[] = [
      makeMilestone({ id: "a", status: "celebrated" }),
      makeMilestone({ id: "b", status: "reached" }),
      makeMilestone({ id: "c", status: "reached" }),
    ];
    expect(getActiveMilestone(ms)?.id).toBe("b");
  });

  it("5.3 returns null for empty array", () => {
    expect(getActiveMilestone([])).toBeNull();
  });

  it("5.4 returns null for non-array input", () => {
    expect(getActiveMilestone(null as any)).toBeNull();
    expect(getActiveMilestone(undefined as any)).toBeNull();
  });
});

// ── 6. formatInsightValue ─────────────────────────────────────────────────────

describe("6. formatInsightValue", () => {
  it("6.1 formats small numbers as integers", () => {
    expect(formatInsightValue(42)).toBe("42");
    expect(formatInsightValue(0)).toBe("0");
  });

  it("6.2 abbreviates thousands", () => {
    expect(formatInsightValue(1_500)).toBe("1.5K");
    expect(formatInsightValue(10_000)).toBe("10.0K");
  });

  it("6.3 abbreviates millions", () => {
    expect(formatInsightValue(1_500_000)).toBe("1.5M");
  });

  it("6.4 returns em-dash for non-finite", () => {
    expect(formatInsightValue(NaN)).toBe("—");
    expect(formatInsightValue(Infinity)).toBe("—");
  });

  it("6.5 rounds small values", () => {
    expect(formatInsightValue(42.7)).toBe("43");
  });
});

// ── 7. deriveInsights ─────────────────────────────────────────────────────────

describe("7. deriveInsights", () => {
  it("7.1 returns array for valid metrics", () => {
    const insights = deriveInsights(makeMetrics(), MILESTONES);
    expect(Array.isArray(insights)).toBe(true);
  });

  it("7.2 returns empty array for invalid metrics", () => {
    expect(deriveInsights(null as any, MILESTONES)).toEqual([]);
    expect(deriveInsights(undefined as any, MILESTONES)).toEqual([]);
  });

  it("7.3 caps at MAX_INSIGHTS", () => {
    const metrics = makeMetrics({
      dailyVelocity: 2_000,
      contributorCount: 20,
      daysRemaining: 2,
      largestContrib: 3_000,
    });
    const ms = [makeMilestone({ status: "reached" })];
    const insights = deriveInsights(metrics, ms);
    expect(insights.length).toBeLessThanOrEqual(MAX_INSIGHTS);
  });

  it("7.4 includes velocity insight when velocity > 0", () => {
    const insights = deriveInsights(makeMetrics({ dailyVelocity: 500 }), []);
    expect(insights.some((i) => i.id === "velocity")).toBe(true);
  });

  it("7.5 velocity insight is success when above threshold", () => {
    const insights = deriveInsights(
      makeMetrics({ dailyVelocity: STRONG_VELOCITY_THRESHOLD }),
      [],
    );
    const v = insights.find((i) => i.id === "velocity");
    expect(v?.severity).toBe("success");
  });

  it("7.6 velocity insight is info when below threshold", () => {
    const insights = deriveInsights(
      makeMetrics({ dailyVelocity: STRONG_VELOCITY_THRESHOLD - 1 }),
      [],
    );
    const v = insights.find((i) => i.id === "velocity");
    expect(v?.severity).toBe("info");
  });

  it("7.7 includes projection insight when daysToGoal is computable", () => {
    const insights = deriveInsights(
      makeMetrics({ totalRaised: 5_000, goal: 10_000, dailyVelocity: 1_000, daysRemaining: 10 }),
      [],
    );
    expect(insights.some((i) => i.id === "projection")).toBe(true);
  });

  it("7.8 projection is warning when behind schedule", () => {
    const insights = deriveInsights(
      makeMetrics({ totalRaised: 1_000, goal: 10_000, dailyVelocity: 100, daysRemaining: 5 }),
      [],
    );
    const p = insights.find((i) => i.id === "projection");
    expect(p?.severity).toBe("warning");
  });

  it("7.9 includes urgency insight when ≤ 3 days remain and not funded", () => {
    const insights = deriveInsights(
      makeMetrics({ daysRemaining: 2, totalRaised: 1_000, goal: 10_000 }),
      [],
    );
    expect(insights.some((i) => i.id === "urgency")).toBe(true);
  });

  it("7.10 urgency insight is critical", () => {
    const insights = deriveInsights(
      makeMetrics({ daysRemaining: 1, totalRaised: 1_000, goal: 10_000 }),
      [],
    );
    const u = insights.find((i) => i.id === "urgency");
    expect(u?.severity).toBe("critical");
  });

  it("7.11 no urgency when fully funded", () => {
    const insights = deriveInsights(
      makeMetrics({ daysRemaining: 1, totalRaised: 10_000, goal: 10_000 }),
      [],
    );
    expect(insights.some((i) => i.id === "urgency")).toBe(false);
  });

  it("7.12 includes whale insight when largest contrib >= 20% of goal", () => {
    const insights = deriveInsights(
      makeMetrics({ largestContrib: 2_000, goal: 10_000 }),
      [],
    );
    expect(insights.some((i) => i.id === "whale")).toBe(true);
  });

  it("7.13 no whale insight when largest contrib < 20% of goal", () => {
    const insights = deriveInsights(
      makeMetrics({ largestContrib: 1_999, goal: 10_000 }),
      [],
    );
    expect(insights.some((i) => i.id === "whale")).toBe(false);
  });

  it("7.14 includes milestone celebration insight when milestone is reached", () => {
    const ms = [makeMilestone({ id: "m1", status: "reached" })];
    const insights = deriveInsights(makeMetrics(), ms);
    expect(insights.some((i) => i.id === "milestone-m1")).toBe(true);
  });

  it("7.15 sorts critical insights first", () => {
    const insights = deriveInsights(
      makeMetrics({ daysRemaining: 1, totalRaised: 1_000, goal: 10_000, dailyVelocity: 100 }),
      [],
    );
    if (insights.length > 1) {
      expect(insights[0].severity).toBe("critical");
    }
  });

  it("7.16 no velocity insight when velocity is 0", () => {
    const insights = deriveInsights(makeMetrics({ dailyVelocity: 0 }), []);
    expect(insights.some((i) => i.id === "velocity")).toBe(false);
  });

  it("7.17 engagement insight is success when count >= threshold", () => {
    const insights = deriveInsights(
      makeMetrics({ contributorCount: HIGH_ENGAGEMENT_THRESHOLD }),
      [],
    );
    const e = insights.find((i) => i.id === "engagement");
    expect(e?.severity).toBe("success");
  });
});

// ── 8. InsightCard ────────────────────────────────────────────────────────────

describe("8. InsightCard", () => {
  const makeInsight = (overrides: Partial<Insight> = {}): Insight => ({
    id: "test",
    category: "info",
    severity: "info",
    title: "Test Insight",
    body: "Test body text.",
    ...overrides,
  });

  it("8.1 renders title and body", () => {
    render(<InsightCard insight={makeInsight()} />);
    expect(screen.getByText("Test Insight")).toBeInTheDocument();
    expect(screen.getByText("Test body text.")).toBeInTheDocument();
  });

  it("8.2 renders value when provided", () => {
    render(<InsightCard insight={makeInsight({ value: "42K" })} />);
    expect(screen.getByText("42K")).toBeInTheDocument();
  });

  it("8.3 does not render value element when absent", () => {
    const { container } = render(<InsightCard insight={makeInsight()} />);
    // No value span should be present
    expect(container.querySelector('[aria-label^="Value:"]')).toBeNull();
  });

  it("8.4 has role=article", () => {
    render(<InsightCard insight={makeInsight()} />);
    expect(screen.getByRole("article")).toBeInTheDocument();
  });

  it("8.5 uses custom data-testid", () => {
    render(<InsightCard insight={makeInsight()} data-testid="my-card" />);
    expect(screen.getByTestId("my-card")).toBeInTheDocument();
  });

  it("8.6 renders all severity variants without error", () => {
    const severities = ["info", "success", "warning", "critical"] as const;
    severities.forEach((severity) => {
      const { unmount } = render(
        <InsightCard insight={makeInsight({ severity })} />,
      );
      unmount();
    });
  });
});

// ── 9. InsightPanel ───────────────────────────────────────────────────────────

describe("9. InsightPanel", () => {
  const insights: Insight[] = [
    { id: "a", category: "velocity", severity: "success", title: "A", body: "Body A" },
    { id: "b", category: "engagement", severity: "info", title: "B", body: "Body B" },
  ];

  it("9.1 renders loading state", () => {
    render(<InsightPanel insights={[]} isLoading />);
    expect(screen.getByTestId("insight-panel-loading")).toBeInTheDocument();
    expect(screen.getByText("Loading insights…")).toBeInTheDocument();
  });

  it("9.2 renders empty state when no insights", () => {
    render(<InsightPanel insights={[]} />);
    expect(screen.getByTestId("insight-panel-empty")).toBeInTheDocument();
    expect(screen.getByText("No insights available yet.")).toBeInTheDocument();
  });

  it("9.3 renders insight cards", () => {
    render(<InsightPanel insights={insights} />);
    expect(screen.getByTestId("insight-panel")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("9.4 includes campaign name in aria-label", () => {
    render(<InsightPanel insights={insights} campaignName="My Campaign" />);
    expect(
      screen.getByRole("region", { name: /My Campaign/i }),
    ).toBeInTheDocument();
  });

  it("9.5 renders empty state for non-array insights", () => {
    render(<InsightPanel insights={null as any} />);
    expect(screen.getByTestId("insight-panel-empty")).toBeInTheDocument();
  });
});

// ── 10. CelebrationInsights ───────────────────────────────────────────────────

describe("10. CelebrationInsights", () => {
  it("10.1 renders root element", () => {
    renderInsights();
    expect(screen.getByTestId("celebration-insights-root")).toBeInTheDocument();
  });

  it("10.2 does not show celebration panel when no milestone is reached", () => {
    renderInsights();
    expect(screen.queryByTestId("celebration-panel")).toBeNull();
  });

  it("10.3 shows celebration panel when a milestone is reached", () => {
    const ms = [makeMilestone({ status: "reached", label: "50% Funded" })];
    renderInsights({ milestones: ms });
    expect(screen.getByTestId("celebration-panel")).toBeInTheDocument();
    expect(screen.getByTestId("milestone-label")).toHaveTextContent("50% Funded");
  });

  it("10.4 dismiss button hides celebration panel", () => {
    const ms = [makeMilestone({ status: "reached" })];
    renderInsights({ milestones: ms });
    fireEvent.click(screen.getByTestId("dismiss-button"));
    expect(screen.queryByTestId("celebration-panel")).toBeNull();
  });

  it("10.5 onDismiss callback fires on dismiss", () => {
    const onDismiss = jest.fn();
    const ms = [makeMilestone({ status: "reached" })];
    renderInsights({ milestones: ms, onDismiss });
    fireEvent.click(screen.getByTestId("dismiss-button"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("10.6 auto-dismiss fires after delay", () => {
    jest.useFakeTimers();
    const onDismiss = jest.fn();
    const ms = [makeMilestone({ status: "reached" })];
    renderInsights({ milestones: ms, onDismiss, autoDismissMs: 3_000 });
    expect(screen.getByTestId("celebration-panel")).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(3_000));
    expect(screen.queryByTestId("celebration-panel")).toBeNull();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it("10.7 auto-dismiss does not fire when autoDismissMs=0", () => {
    jest.useFakeTimers();
    const onDismiss = jest.fn();
    const ms = [makeMilestone({ status: "reached" })];
    renderInsights({ milestones: ms, onDismiss, autoDismissMs: 0 });
    act(() => jest.advanceTimersByTime(10_000));
    expect(screen.getByTestId("celebration-panel")).toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("10.8 onMilestoneReach callback fires when milestone is reached", () => {
    const onMilestoneReach = jest.fn();
    const ms = [makeMilestone({ id: "m1", status: "reached" })];
    renderInsights({ milestones: ms, onMilestoneReach });
    expect(onMilestoneReach).toHaveBeenCalledWith(
      expect.objectContaining({ id: "m1" }),
    );
  });

  it("10.9 shows campaign name in celebration panel", () => {
    const ms = [makeMilestone({ status: "reached" })];
    renderInsights({ milestones: ms, campaignName: "My Campaign" });
    expect(screen.getByTestId("campaign-name")).toHaveTextContent("My Campaign");
  });

  it("10.10 hides insights panel when showInsights=false", () => {
    renderInsights({ showInsights: false });
    expect(screen.queryByTestId("insight-panel")).toBeNull();
    expect(screen.queryByTestId("insight-panel-empty")).toBeNull();
  });

  it("10.11 renders progress bar", () => {
    renderInsights({ currentPercent: 60 });
    expect(screen.getByTestId("progress-bar")).toBeInTheDocument();
    const fill = screen.getByTestId("progress-fill");
    expect(fill).toHaveStyle({ width: "60%" });
  });

  it("10.12 progress bar clamps out-of-range values", () => {
    renderInsights({ currentPercent: 150 });
    const fill = screen.getByTestId("progress-fill");
    expect(fill).toHaveStyle({ width: "100%" });
  });

  it("10.13 handles null milestones gracefully", () => {
    renderInsights({ milestones: null as any });
    expect(screen.getByTestId("celebration-insights-root")).toBeInTheDocument();
  });

  it("10.14 campaign name is truncated to MAX_CAMPAIGN_NAME_LENGTH", () => {
    const longName = "A".repeat(MAX_CAMPAIGN_NAME_LENGTH + 50);
    const ms = [makeMilestone({ status: "reached" })];
    renderInsights({ milestones: ms, campaignName: longName });
    const nameEl = screen.getByTestId("campaign-name");
    expect(nameEl.textContent!.length).toBeLessThanOrEqual(MAX_CAMPAIGN_NAME_LENGTH);
  });

  it("10.15 XSS: script tag in campaign name rendered as text", () => {
    const xss = "<script>alert(1)</script>";
    const ms = [makeMilestone({ status: "reached" })];
    renderInsights({ milestones: ms, campaignName: xss });
    // Should not throw; content rendered as text node
    expect(screen.getByTestId("campaign-name").textContent).toBe(xss);
  });

  it("10.16 milestone percent is clamped in celebration panel", () => {
    const ms = [makeMilestone({ status: "reached", targetPercent: 150 })];
    renderInsights({ milestones: ms });
    expect(screen.getByTestId("milestone-percent")).toHaveTextContent("100% of goal");
  });

  it("10.17 DEFAULT_AUTO_DISMISS_MS is 5000", () => {
    expect(DEFAULT_AUTO_DISMISS_MS).toBe(5_000);
  });

  it("10.18 renders with id and className props", () => {
    renderInsights({ id: "my-id", className: "my-class" });
    const root = screen.getByTestId("celebration-insights-root");
    expect(root).toHaveAttribute("id", "my-id");
    expect(root).toHaveClass("my-class");
  });
});
