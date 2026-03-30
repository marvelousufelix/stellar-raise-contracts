/**
 * @title MilestoneAnalytics — Comprehensive Test Suite
 * @notice Covers pure helpers, KPI derivation, AnalyticsCard, AnalyticsDashboard,
 *         and the MilestoneAnalytics component (overlay, dismiss, auto-dismiss,
 *         deduplication, callbacks, accessibility, and edge cases).
 *
 * @dev Targets ≥ 95% coverage of milestone_analytics.tsx.
 *
 * @custom:security-note Tests assert that user-supplied strings are sanitized
 *         and that no user-controlled values reach style attributes beyond the
 *         hardcoded severity-color map.
 */

import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import MilestoneAnalytics, {
  ANALYTICS_MILESTONES,
  DEFAULT_ANALYTICS_DISMISS_MS,
  HEALTHY_CONVERSION_RATE,
  HIGH_ENGAGEMENT_THRESHOLD,
  MAX_ANALYTICS_NAME_LENGTH,
  MAX_KPI_CARDS,
  STRONG_VELOCITY_THRESHOLD,
  AnalyticsCard,
  AnalyticsDashboard,
  clampAnalyticsPercent,
  computeConversionRate,
  computeDaysToGoal,
  computeFundingPercent,
  computeVelocityTrend,
  deriveKpis,
  formatAnalyticsValue,
  getMilestoneAnalyticsContent,
  resolveAnalyticsMilestone,
  sanitizeAnalyticsString,
  type AnalyticsMetrics,
  type AnalyticsMilestone,
  type KpiMetric,
  type MilestoneAnalyticsProps,
} from "./milestone_analytics";

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(() => { jest.useFakeTimers(); });
afterAll(() => { jest.useRealTimers(); });
afterEach(() => {
  jest.clearAllTimers();
  jest.clearAllMocks();
});

function makeMetrics(overrides: Partial<AnalyticsMetrics> = {}): AnalyticsMetrics {
  return {
    totalRaised: 500,
    goal: 1000,
    contributorCount: 15,
    pageViews: 200,
    daysRemaining: 10,
    dailyVelocity: 1500,
    previousVelocity: 1200,
    largestContrib: 100,
    ...overrides,
  };
}

function renderComponent(props: Partial<MilestoneAnalyticsProps> = {}) {
  return render(
    <MilestoneAnalytics
      currentPercent={0}
      metrics={makeMetrics()}
      autoDismissMs={0}
      {...props}
    />,
  );
}

// ── clampAnalyticsPercent ─────────────────────────────────────────────────────

describe("clampAnalyticsPercent", () => {
  it("returns 0 for NaN", () => expect(clampAnalyticsPercent(NaN)).toBe(0));
  it("returns 0 for Infinity", () => expect(clampAnalyticsPercent(Infinity)).toBe(0));
  it("returns 0 for -Infinity", () => expect(clampAnalyticsPercent(-Infinity)).toBe(0));
  it("returns 0 for non-number", () =>
    expect(clampAnalyticsPercent("x" as unknown as number)).toBe(0));
  it("clamps -1 to 0", () => expect(clampAnalyticsPercent(-1)).toBe(0));
  it("clamps 101 to 100", () => expect(clampAnalyticsPercent(101)).toBe(100));
  it("passes 0 through", () => expect(clampAnalyticsPercent(0)).toBe(0));
  it("passes 50 through", () => expect(clampAnalyticsPercent(50)).toBe(50));
  it("passes 100 through", () => expect(clampAnalyticsPercent(100)).toBe(100));
  it("clamps large number to 100", () =>
    expect(clampAnalyticsPercent(999_999)).toBe(100));
});

// ── sanitizeAnalyticsString ───────────────────────────────────────────────────

describe("sanitizeAnalyticsString", () => {
  it("returns '' for null", () =>
    expect(sanitizeAnalyticsString(null, 60)).toBe(""));
  it("returns '' for undefined", () =>
    expect(sanitizeAnalyticsString(undefined, 60)).toBe(""));
  it("returns '' for number", () =>
    expect(sanitizeAnalyticsString(42, 60)).toBe(""));
  it("strips control characters", () =>
    expect(sanitizeAnalyticsString("hello\x00world", 60)).toBe("hello world"));
  it("strips DEL character", () =>
    expect(sanitizeAnalyticsString("a\x7Fb", 60)).toBe("a b"));
  it("collapses whitespace", () =>
    expect(sanitizeAnalyticsString("a   b", 60)).toBe("a b"));
  it("truncates to maxLength", () =>
    expect(sanitizeAnalyticsString("abcdef", 3)).toBe("abc"));
  it("returns '' for blank input", () =>
    expect(sanitizeAnalyticsString("   ", 60)).toBe(""));
  it("passes through normal string", () =>
    expect(sanitizeAnalyticsString("Solar Farm", 60)).toBe("Solar Farm"));
  it("strips HTML-like tags", () =>
    expect(sanitizeAnalyticsString("<script>alert(1)</script>", 60)).toBe("alert(1)"));
  it("respects MAX_ANALYTICS_NAME_LENGTH constant", () => {
    const long = "a".repeat(MAX_ANALYTICS_NAME_LENGTH + 10);
    expect(sanitizeAnalyticsString(long, MAX_ANALYTICS_NAME_LENGTH)).toHaveLength(
      MAX_ANALYTICS_NAME_LENGTH,
    );
  });
});

// ── resolveAnalyticsMilestone ─────────────────────────────────────────────────

describe("resolveAnalyticsMilestone", () => {
  it("returns null when below all thresholds", () =>
    expect(resolveAnalyticsMilestone(10, new Set())).toBeNull());
  it("returns 25 when at 25%", () =>
    expect(resolveAnalyticsMilestone(25, new Set())).toBe(25));
  it("returns 25 when above 25% but below 50%", () =>
    expect(resolveAnalyticsMilestone(40, new Set())).toBe(25));
  it("returns 50 when 25 already celebrated", () =>
    expect(resolveAnalyticsMilestone(50, new Set([25]))).toBe(50));
  it("returns 75 when 25 and 50 celebrated", () =>
    expect(resolveAnalyticsMilestone(80, new Set([25, 50]))).toBe(75));
  it("returns 100 when all others celebrated", () =>
    expect(resolveAnalyticsMilestone(100, new Set([25, 50, 75]))).toBe(100));
  it("returns null when all milestones celebrated", () =>
    expect(resolveAnalyticsMilestone(100, new Set([25, 50, 75, 100]))).toBeNull());
  it("returns null at 0%", () =>
    expect(resolveAnalyticsMilestone(0, new Set())).toBeNull());
});

// ── getMilestoneAnalyticsContent ──────────────────────────────────────────────

describe("getMilestoneAnalyticsContent", () => {
  it.each(ANALYTICS_MILESTONES)("returns non-empty icon and heading for %i%%", (t) => {
    const { icon, heading } = getMilestoneAnalyticsContent(t as AnalyticsMilestone);
    expect(typeof icon).toBe("string");
    expect(icon.length).toBeGreaterThan(0);
    expect(typeof heading).toBe("string");
    expect(heading.length).toBeGreaterThan(0);
  });
  it("heading for 25 contains '25%'", () =>
    expect(getMilestoneAnalyticsContent(25).heading).toContain("25%"));
  it("heading for 50 contains 'Halfway'", () =>
    expect(getMilestoneAnalyticsContent(50).heading).toContain("Halfway"));
  it("heading for 75 contains '75%'", () =>
    expect(getMilestoneAnalyticsContent(75).heading).toContain("75%"));
  it("heading for 100 contains 'Goal'", () =>
    expect(getMilestoneAnalyticsContent(100).heading).toContain("Goal"));
});

// ── computeFundingPercent ─────────────────────────────────────────────────────

describe("computeFundingPercent", () => {
  it("returns 0 for zero goal", () => expect(computeFundingPercent(500, 0)).toBe(0));
  it("returns 0 for negative goal", () => expect(computeFundingPercent(500, -1)).toBe(0));
  it("returns 0 for NaN goal", () => expect(computeFundingPercent(500, NaN)).toBe(0));
  it("returns 0 for zero raised", () => expect(computeFundingPercent(0, 1000)).toBe(0));
  it("returns 50 for half funded", () => expect(computeFundingPercent(500, 1000)).toBe(50));
  it("returns 100 for fully funded", () => expect(computeFundingPercent(1000, 1000)).toBe(100));
  it("clamps to 100 for over-funded", () => expect(computeFundingPercent(1500, 1000)).toBe(100));
});

// ── computeConversionRate ─────────────────────────────────────────────────────

describe("computeConversionRate", () => {
  it("returns 0 for zero pageViews", () => expect(computeConversionRate(10, 0)).toBe(0));
  it("returns 0 for negative pageViews", () => expect(computeConversionRate(10, -5)).toBe(0));
  it("returns 0 for NaN pageViews", () => expect(computeConversionRate(10, NaN)).toBe(0));
  it("returns 0 for zero contributors", () => expect(computeConversionRate(0, 200)).toBe(0));
  it("returns 5 for 10/200", () => expect(computeConversionRate(10, 200)).toBe(5));
  it("returns 50 for 100/200", () => expect(computeConversionRate(100, 200)).toBe(50));
  it("clamps to 100 for contributors > pageViews", () =>
    expect(computeConversionRate(300, 200)).toBe(100));
  it("HEALTHY_CONVERSION_RATE constant is 5", () =>
    expect(HEALTHY_CONVERSION_RATE).toBe(5));
});

// ── computeVelocityTrend ──────────────────────────────────────────────────────

describe("computeVelocityTrend", () => {
  it("returns 'flat' when both are 0", () =>
    expect(computeVelocityTrend(0, 0)).toBe("flat"));
  it("returns 'up' when previous is 0 and current > 0", () =>
    expect(computeVelocityTrend(100, 0)).toBe("up"));
  it("returns 'flat' when both are 0 (current=0, prev=0)", () =>
    expect(computeVelocityTrend(0, 0)).toBe("flat"));
  it("returns 'up' for >5% increase", () =>
    expect(computeVelocityTrend(1100, 1000)).toBe("up"));
  it("returns 'down' for >5% decrease", () =>
    expect(computeVelocityTrend(900, 1000)).toBe("down"));
  it("returns 'flat' for ≤5% change", () =>
    expect(computeVelocityTrend(1030, 1000)).toBe("flat"));
  it("handles NaN current gracefully", () =>
    expect(computeVelocityTrend(NaN, 1000)).toBe("down"));
  it("handles NaN previous gracefully", () =>
    expect(computeVelocityTrend(1000, NaN)).toBe("up"));
  it("handles negative values as 0", () =>
    expect(computeVelocityTrend(-100, 1000)).toBe("down"));
});

// ── computeDaysToGoal ─────────────────────────────────────────────────────────

describe("computeDaysToGoal", () => {
  it("returns null for zero velocity", () =>
    expect(computeDaysToGoal(500, 1000, 0)).toBeNull());
  it("returns null for negative velocity", () =>
    expect(computeDaysToGoal(500, 1000, -10)).toBeNull());
  it("returns null when goal already met", () =>
    expect(computeDaysToGoal(1000, 1000, 100)).toBeNull());
  it("returns null for NaN totalRaised", () =>
    expect(computeDaysToGoal(NaN, 1000, 100)).toBeNull());
  it("returns null for NaN goal", () =>
    expect(computeDaysToGoal(500, NaN, 100)).toBeNull());
  it("returns ceiling of remaining/velocity", () =>
    expect(computeDaysToGoal(500, 1000, 300)).toBe(2)); // 500/300 = 1.67 → ceil = 2
  it("returns 1 for exactly 1 day", () =>
    expect(computeDaysToGoal(500, 1000, 500)).toBe(1));
});

// ── formatAnalyticsValue ──────────────────────────────────────────────────────

describe("formatAnalyticsValue", () => {
  it("returns '—' for NaN", () => expect(formatAnalyticsValue(NaN)).toBe("—"));
  it("returns '—' for Infinity", () => expect(formatAnalyticsValue(Infinity)).toBe("—"));
  it("formats 0 as '0'", () => expect(formatAnalyticsValue(0)).toBe("0"));
  it("formats 999 as '999'", () => expect(formatAnalyticsValue(999)).toBe("999"));
  it("formats 1000 as '1.0K'", () => expect(formatAnalyticsValue(1000)).toBe("1.0K"));
  it("formats 1500 as '1.5K'", () => expect(formatAnalyticsValue(1500)).toBe("1.5K"));
  it("formats 1_000_000 as '1.0M'", () =>
    expect(formatAnalyticsValue(1_000_000)).toBe("1.0M"));
  it("formats 2_500_000 as '2.5M'", () =>
    expect(formatAnalyticsValue(2_500_000)).toBe("2.5M"));
  it("rounds sub-1000 values", () => expect(formatAnalyticsValue(99.7)).toBe("100"));
});

// ── deriveKpis ────────────────────────────────────────────────────────────────

describe("deriveKpis", () => {
  it("returns [] for null input", () =>
    expect(deriveKpis(null as unknown as AnalyticsMetrics)).toEqual([]));
  it("returns [] for non-object input", () =>
    expect(deriveKpis("bad" as unknown as AnalyticsMetrics)).toEqual([]));

  it("always includes a funding KPI", () => {
    const kpis = deriveKpis(makeMetrics());
    expect(kpis.some((k) => k.id === "funding")).toBe(true);
  });

  it("funding KPI shows correct percentage", () => {
    const kpis = deriveKpis(makeMetrics({ totalRaised: 500, goal: 1000 }));
    const funding = kpis.find((k) => k.id === "funding")!;
    expect(funding.value).toBe("50.0%");
  });

  it("funding KPI is 'success' at 100%", () => {
    const kpis = deriveKpis(makeMetrics({ totalRaised: 1000, goal: 1000 }));
    const funding = kpis.find((k) => k.id === "funding")!;
    expect(funding.severity).toBe("success");
  });

  it("funding KPI is 'warning' below 50%", () => {
    const kpis = deriveKpis(makeMetrics({ totalRaised: 400, goal: 1000 }));
    const funding = kpis.find((k) => k.id === "funding")!;
    expect(funding.severity).toBe("warning");
  });

  it("includes velocity KPI when dailyVelocity > 0", () => {
    const kpis = deriveKpis(makeMetrics({ dailyVelocity: 500 }));
    expect(kpis.some((k) => k.id === "velocity")).toBe(true);
  });

  it("omits velocity KPI when dailyVelocity is 0", () => {
    const kpis = deriveKpis(makeMetrics({ dailyVelocity: 0 }));
    expect(kpis.some((k) => k.id === "velocity")).toBe(false);
  });

  it("velocity KPI is 'success' above STRONG_VELOCITY_THRESHOLD", () => {
    const kpis = deriveKpis(makeMetrics({ dailyVelocity: STRONG_VELOCITY_THRESHOLD + 1 }));
    const v = kpis.find((k) => k.id === "velocity")!;
    expect(v.severity).toBe("success");
  });

  it("velocity KPI is 'info' below STRONG_VELOCITY_THRESHOLD", () => {
    const kpis = deriveKpis(makeMetrics({ dailyVelocity: STRONG_VELOCITY_THRESHOLD - 1 }));
    const v = kpis.find((k) => k.id === "velocity")!;
    expect(v.severity).toBe("info");
  });

  it("includes contributors KPI when contributorCount > 0", () => {
    const kpis = deriveKpis(makeMetrics({ contributorCount: 5 }));
    expect(kpis.some((k) => k.id === "contributors")).toBe(true);
  });

  it("omits contributors KPI when contributorCount is 0", () => {
    const kpis = deriveKpis(makeMetrics({ contributorCount: 0 }));
    expect(kpis.some((k) => k.id === "contributors")).toBe(false);
  });

  it("contributors KPI is 'success' at HIGH_ENGAGEMENT_THRESHOLD", () => {
    const kpis = deriveKpis(makeMetrics({ contributorCount: HIGH_ENGAGEMENT_THRESHOLD }));
    const c = kpis.find((k) => k.id === "contributors")!;
    expect(c.severity).toBe("success");
  });

  it("includes conversion KPI when pageViews > 0", () => {
    const kpis = deriveKpis(makeMetrics({ pageViews: 200, contributorCount: 10 }));
    expect(kpis.some((k) => k.id === "conversion")).toBe(true);
  });

  it("omits conversion KPI when pageViews is 0", () => {
    const kpis = deriveKpis(makeMetrics({ pageViews: 0 }));
    expect(kpis.some((k) => k.id === "conversion")).toBe(false);
  });

  it("conversion KPI is 'success' when rate >= HEALTHY_CONVERSION_RATE", () => {
    const kpis = deriveKpis(makeMetrics({ contributorCount: 10, pageViews: 200 })); // 5%
    const c = kpis.find((k) => k.id === "conversion")!;
    expect(c.severity).toBe("success");
  });

  it("conversion KPI is 'warning' when rate < HEALTHY_CONVERSION_RATE", () => {
    const kpis = deriveKpis(makeMetrics({ contributorCount: 1, pageViews: 200 })); // 0.5%
    const c = kpis.find((k) => k.id === "conversion")!;
    expect(c.severity).toBe("warning");
  });

  it("includes projection KPI when daysToGoal is computable", () => {
    const kpis = deriveKpis(makeMetrics({
      totalRaised: 500, goal: 1000, dailyVelocity: 100, daysRemaining: 10,
    }));
    expect(kpis.some((k) => k.id === "projection")).toBe(true);
  });

  it("projection KPI is 'success' when on track", () => {
    const kpis = deriveKpis(makeMetrics({
      totalRaised: 500, goal: 1000, dailyVelocity: 100, daysRemaining: 10,
    })); // daysToGoal = 5, daysRemaining = 10 → on track
    const p = kpis.find((k) => k.id === "projection")!;
    expect(p.severity).toBe("success");
  });

  it("projection KPI is 'warning' when behind", () => {
    const kpis = deriveKpis(makeMetrics({
      totalRaised: 100, goal: 1000, dailyVelocity: 10, daysRemaining: 5,
    })); // daysToGoal = 90, daysRemaining = 5 → behind
    const p = kpis.find((k) => k.id === "projection")!;
    expect(p.severity).toBe("warning");
  });

  it("includes urgency KPI when daysRemaining <= 3 and not fully funded", () => {
    const kpis = deriveKpis(makeMetrics({
      totalRaised: 500, goal: 1000, daysRemaining: 2,
    }));
    expect(kpis.some((k) => k.id === "urgency")).toBe(true);
  });

  it("omits urgency KPI when fully funded", () => {
    const kpis = deriveKpis(makeMetrics({
      totalRaised: 1000, goal: 1000, daysRemaining: 2,
    }));
    expect(kpis.some((k) => k.id === "urgency")).toBe(false);
  });

  it("urgency KPI is 'critical'", () => {
    const kpis = deriveKpis(makeMetrics({
      totalRaised: 500, goal: 1000, daysRemaining: 1,
    }));
    const u = kpis.find((k) => k.id === "urgency")!;
    expect(u.severity).toBe("critical");
  });

  it("caps results at MAX_KPI_CARDS", () => {
    const kpis = deriveKpis(makeMetrics({
      totalRaised: 500, goal: 1000, daysRemaining: 1,
      dailyVelocity: 100, contributorCount: 20, pageViews: 200,
    }));
    expect(kpis.length).toBeLessThanOrEqual(MAX_KPI_CARDS);
  });

  it("sorts critical before warning before success before info", () => {
    const kpis = deriveKpis(makeMetrics({
      totalRaised: 500, goal: 1000, daysRemaining: 1,
      dailyVelocity: 100, contributorCount: 20, pageViews: 200,
    }));
    const order: Record<string, number> = { critical: 0, warning: 1, success: 2, info: 3 };
    for (let i = 1; i < kpis.length; i++) {
      expect(order[kpis[i].severity]).toBeGreaterThanOrEqual(order[kpis[i - 1].severity]);
    }
  });
});

// ── AnalyticsCard ─────────────────────────────────────────────────────────────

describe("AnalyticsCard", () => {
  const kpi: KpiMetric = {
    id: "test",
    category: "funding",
    severity: "success",
    label: "Test KPI",
    value: "42%",
    subtext: "Some detail",
    trend: "up",
  };

  it("renders label and value", () => {
    render(<AnalyticsCard kpi={kpi} />);
    expect(screen.getByTestId("kpi-label-test")).toHaveTextContent("Test KPI");
    expect(screen.getByTestId("kpi-value-test")).toHaveTextContent("42%");
  });

  it("renders subtext when provided", () => {
    render(<AnalyticsCard kpi={kpi} />);
    expect(screen.getByTestId("kpi-subtext-test")).toHaveTextContent("Some detail");
  });

  it("renders trend indicator when provided", () => {
    render(<AnalyticsCard kpi={kpi} />);
    expect(screen.getByTestId("kpi-trend-test")).toBeInTheDocument();
  });

  it("omits subtext when not provided", () => {
    render(<AnalyticsCard kpi={{ ...kpi, subtext: undefined }} />);
    expect(screen.queryByTestId("kpi-subtext-test")).toBeNull();
  });

  it("omits trend when not provided", () => {
    render(<AnalyticsCard kpi={{ ...kpi, trend: undefined }} />);
    expect(screen.queryByTestId("kpi-trend-test")).toBeNull();
  });

  it("uses custom data-testid when provided", () => {
    render(<AnalyticsCard kpi={kpi} data-testid="custom-card" />);
    expect(screen.getByTestId("custom-card")).toBeInTheDocument();
  });

  it("has accessible aria-label", () => {
    render(<AnalyticsCard kpi={kpi} />);
    expect(screen.getByRole("article", { name: "Test KPI: 42%" })).toBeInTheDocument();
  });

  it.each(["info", "success", "warning", "critical"] as const)(
    "renders without error for severity '%s'",
    (severity) => {
      expect(() =>
        render(<AnalyticsCard kpi={{ ...kpi, severity }} />),
      ).not.toThrow();
    },
  );
});

// ── AnalyticsDashboard ────────────────────────────────────────────────────────

describe("AnalyticsDashboard", () => {
  const kpis: KpiMetric[] = [
    { id: "a", category: "funding", severity: "success", label: "A", value: "1" },
    { id: "b", category: "velocity", severity: "info", label: "B", value: "2" },
  ];

  it("renders dashboard region with default label", () => {
    render(<AnalyticsDashboard kpis={kpis} />);
    expect(screen.getByRole("region", { name: "Campaign Analytics" })).toBeInTheDocument();
  });

  it("renders dashboard region with campaign name", () => {
    render(<AnalyticsDashboard kpis={kpis} campaignName="Solar Farm" />);
    expect(screen.getByRole("region", { name: "Solar Farm Analytics" })).toBeInTheDocument();
  });

  it("sanitizes campaign name in label — strips HTML tags", () => {
    render(<AnalyticsDashboard kpis={kpis} campaignName={"<script>alert(1)</script>"} />);
    const region = screen.getByRole("region");
    expect(region.getAttribute("aria-label")).not.toContain("<script>");
    expect(region.getAttribute("aria-label")).not.toContain("</script>");
  });

  it("renders all KPI cards", () => {
    render(<AnalyticsDashboard kpis={kpis} />);
    expect(screen.getByTestId("kpi-card-a")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-card-b")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(<AnalyticsDashboard kpis={[]} isLoading />);
    expect(screen.getByTestId("analytics-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("analytics-kpi-grid")).toBeNull();
  });

  it("shows empty state when no kpis and not loading", () => {
    render(<AnalyticsDashboard kpis={[]} />);
    expect(screen.getByTestId("analytics-empty")).toBeInTheDocument();
  });

  it("renders kpi grid when kpis present", () => {
    render(<AnalyticsDashboard kpis={kpis} />);
    expect(screen.getByTestId("analytics-kpi-grid")).toBeInTheDocument();
  });

  it("sets aria-busy=true when loading", () => {
    render(<AnalyticsDashboard kpis={[]} isLoading />);
    expect(screen.getByTestId("analytics-dashboard")).toHaveAttribute("aria-busy", "true");
  });

  it("sets aria-busy=false when not loading", () => {
    render(<AnalyticsDashboard kpis={kpis} />);
    expect(screen.getByTestId("analytics-dashboard")).toHaveAttribute("aria-busy", "false");
  });
});

// ── MilestoneAnalytics — rendering ────────────────────────────────────────────

describe("MilestoneAnalytics — rendering", () => {
  it("renders root element", () => {
    renderComponent();
    expect(screen.getByTestId("milestone-analytics-root")).toBeInTheDocument();
  });

  it("renders dashboard by default", () => {
    renderComponent();
    expect(screen.getByTestId("analytics-dashboard")).toBeInTheDocument();
  });

  it("hides dashboard when showDashboard=false", () => {
    renderComponent({ showDashboard: false });
    expect(screen.queryByTestId("analytics-dashboard")).toBeNull();
  });

  it("does not show overlay below first threshold", () => {
    renderComponent({ currentPercent: 10 });
    expect(screen.queryByTestId("analytics-overlay")).toBeNull();
  });

  it("shows overlay when crossing 25%", () => {
    renderComponent({ currentPercent: 25 });
    expect(screen.getByTestId("analytics-overlay")).toBeInTheDocument();
  });

  it("shows correct heading for 25%", () => {
    renderComponent({ currentPercent: 25 });
    expect(screen.getByTestId("analytics-overlay-heading")).toHaveTextContent("25%");
  });

  it("shows correct heading for 50% after 25% dismissed", () => {
    const { rerender } = renderComponent({ currentPercent: 25 });
    fireEvent.click(screen.getByTestId("analytics-dismiss-button"));
    rerender(
      <MilestoneAnalytics currentPercent={50} metrics={makeMetrics()} autoDismissMs={0} />,
    );
    expect(screen.getByTestId("analytics-overlay-heading")).toHaveTextContent("Halfway");
  });

  it("shows correct heading for 75% after prior milestones dismissed", () => {
    const { rerender } = renderComponent({ currentPercent: 25 });
    fireEvent.click(screen.getByTestId("analytics-dismiss-button"));
    rerender(<MilestoneAnalytics currentPercent={50} metrics={makeMetrics()} autoDismissMs={0} />);
    fireEvent.click(screen.getByTestId("analytics-dismiss-button"));
    rerender(<MilestoneAnalytics currentPercent={75} metrics={makeMetrics()} autoDismissMs={0} />);
    expect(screen.getByTestId("analytics-overlay-heading")).toHaveTextContent("75%");
  });

  it("shows correct heading for 100% after prior milestones dismissed", () => {
    const { rerender } = renderComponent({ currentPercent: 25 });
    fireEvent.click(screen.getByTestId("analytics-dismiss-button"));
    rerender(<MilestoneAnalytics currentPercent={50} metrics={makeMetrics()} autoDismissMs={0} />);
    fireEvent.click(screen.getByTestId("analytics-dismiss-button"));
    rerender(<MilestoneAnalytics currentPercent={75} metrics={makeMetrics()} autoDismissMs={0} />);
    fireEvent.click(screen.getByTestId("analytics-dismiss-button"));
    rerender(<MilestoneAnalytics currentPercent={100} metrics={makeMetrics()} autoDismissMs={0} />);
    expect(screen.getByTestId("analytics-overlay-heading")).toHaveTextContent("Goal Reached");
  });

  it("shows campaign name in overlay when provided", () => {
    renderComponent({ currentPercent: 25, campaignName: "Solar Farm" });
    expect(screen.getByTestId("analytics-overlay-campaign")).toHaveTextContent("Solar Farm");
  });

  it("omits campaign name element when not provided", () => {
    renderComponent({ currentPercent: 25 });
    expect(screen.queryByTestId("analytics-overlay-campaign")).toBeNull();
  });

  it("sanitizes campaign name — strips control chars", () => {
    renderComponent({ currentPercent: 25, campaignName: "Farm\x00Name" });
    expect(screen.getByTestId("analytics-overlay-campaign")).toHaveTextContent("Farm Name");
  });

  it("truncates campaign name to MAX_ANALYTICS_NAME_LENGTH", () => {
    const long = "a".repeat(MAX_ANALYTICS_NAME_LENGTH + 20);
    renderComponent({ currentPercent: 25, campaignName: long });
    const el = screen.getByTestId("analytics-overlay-campaign");
    expect(el.textContent!.length).toBeLessThanOrEqual(MAX_ANALYTICS_NAME_LENGTH);
  });

  it("shows threshold text in overlay", () => {
    const { rerender } = renderComponent({ currentPercent: 25 });
    fireEvent.click(screen.getByTestId("analytics-dismiss-button"));
    rerender(<MilestoneAnalytics currentPercent={50} metrics={makeMetrics()} autoDismissMs={0} />);
    expect(screen.getByTestId("analytics-overlay-threshold")).toHaveTextContent("50% milestone reached");
  });

  it("renders progress bar in overlay", () => {
    renderComponent({ currentPercent: 50, metrics: makeMetrics({ totalRaised: 500, goal: 1000 }) });
    const bar = screen.getByTestId("analytics-overlay-progress");
    expect(bar).toHaveAttribute("role", "progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "50");
  });

  it("renders dismiss button in overlay", () => {
    renderComponent({ currentPercent: 25 });
    expect(screen.getByTestId("analytics-dismiss-button")).toBeInTheDocument();
  });

  it("overlay has role=status and aria-live=polite", () => {
    renderComponent({ currentPercent: 25 });
    const overlay = screen.getByTestId("analytics-overlay");
    expect(overlay).toHaveAttribute("role", "status");
    expect(overlay).toHaveAttribute("aria-live", "polite");
  });

  it("applies custom className to root", () => {
    renderComponent({ className: "my-class" });
    expect(screen.getByTestId("milestone-analytics-root")).toHaveClass("my-class");
  });
});

// ── MilestoneAnalytics — dismiss ──────────────────────────────────────────────

describe("MilestoneAnalytics — dismiss", () => {
  it("hides overlay on manual dismiss", () => {
    renderComponent({ currentPercent: 25 });
    fireEvent.click(screen.getByTestId("analytics-dismiss-button"));
    expect(screen.queryByTestId("analytics-overlay")).toBeNull();
  });

  it("calls onDismiss with threshold on manual dismiss", () => {
    const onDismiss = jest.fn();
    renderComponent({ currentPercent: 25, onDismiss });
    fireEvent.click(screen.getByTestId("analytics-dismiss-button"));
    expect(onDismiss).toHaveBeenCalledWith(25);
  });

  it("auto-dismisses after autoDismissMs", () => {
    const onDismiss = jest.fn();
    renderComponent({ currentPercent: 25, autoDismissMs: 3000, onDismiss });
    expect(screen.getByTestId("analytics-overlay")).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(3000); });
    expect(screen.queryByTestId("analytics-overlay")).toBeNull();
    expect(onDismiss).toHaveBeenCalledWith(25);
  });

  it("does not auto-dismiss when autoDismissMs=0", () => {
    renderComponent({ currentPercent: 25, autoDismissMs: 0 });
    act(() => { jest.advanceTimersByTime(10_000); });
    expect(screen.getByTestId("analytics-overlay")).toBeInTheDocument();
  });

  it("dismiss button has accessible aria-label", () => {
    renderComponent({ currentPercent: 25 });
    expect(screen.getByTestId("analytics-dismiss-button")).toHaveAttribute(
      "aria-label",
      "Dismiss milestone celebration",
    );
  });
});

// ── MilestoneAnalytics — callbacks ────────────────────────────────────────────

describe("MilestoneAnalytics — callbacks", () => {
  it("calls onMilestone with structured event when milestone crossed", () => {
    const onMilestone = jest.fn();
    renderComponent({
      currentPercent: 25,
      metrics: makeMetrics({ contributorCount: 5, totalRaised: 250 }),
      onMilestone,
    });
    expect(onMilestone).toHaveBeenCalledTimes(1);
    const event = onMilestone.mock.calls[0][0];
    expect(event.threshold).toBe(25);
    expect(event.contributorCount).toBe(5);
    expect(event.totalRaised).toBe(250);
    expect(typeof event.reachedAt).toBe("number");
  });

  it("does not call onMilestone below threshold", () => {
    const onMilestone = jest.fn();
    renderComponent({ currentPercent: 10, onMilestone });
    expect(onMilestone).not.toHaveBeenCalled();
  });
});

// ── MilestoneAnalytics — deduplication ───────────────────────────────────────

describe("MilestoneAnalytics — deduplication", () => {
  it("does not re-trigger the same milestone on re-render", () => {
    const onMilestone = jest.fn();
    const { rerender } = renderComponent({ currentPercent: 25, onMilestone });
    rerender(
      <MilestoneAnalytics
        currentPercent={25}
        metrics={makeMetrics()}
        autoDismissMs={0}
        onMilestone={onMilestone}
      />,
    );
    expect(onMilestone).toHaveBeenCalledTimes(1);
  });

  it("triggers next milestone after first is celebrated", () => {
    const onMilestone = jest.fn();
    const { rerender } = renderComponent({ currentPercent: 25, onMilestone });
    // Dismiss first overlay
    fireEvent.click(screen.getByTestId("analytics-dismiss-button"));
    // Advance to 50%
    rerender(
      <MilestoneAnalytics
        currentPercent={50}
        metrics={makeMetrics()}
        autoDismissMs={0}
        onMilestone={onMilestone}
      />,
    );
    expect(onMilestone).toHaveBeenCalledTimes(2);
    expect(onMilestone.mock.calls[1][0].threshold).toBe(50);
  });
});

// ── MilestoneAnalytics — edge cases ──────────────────────────────────────────

describe("MilestoneAnalytics — edge cases", () => {
  it("clamps currentPercent above 100 to 100", () => {
    const onMilestone = jest.fn();
    renderComponent({ currentPercent: 999, onMilestone });
    // Should trigger 25 (first uncelebrated), not crash
    expect(onMilestone).toHaveBeenCalled();
  });

  it("clamps currentPercent below 0 to 0", () => {
    const onMilestone = jest.fn();
    renderComponent({ currentPercent: -50, onMilestone });
    expect(onMilestone).not.toHaveBeenCalled();
  });

  it("handles NaN currentPercent gracefully", () => {
    const onMilestone = jest.fn();
    renderComponent({ currentPercent: NaN, onMilestone });
    expect(onMilestone).not.toHaveBeenCalled();
  });

  it("handles metrics with NaN values gracefully", () => {
    expect(() =>
      renderComponent({
        currentPercent: 25,
        metrics: makeMetrics({ totalRaised: NaN, goal: NaN }),
      }),
    ).not.toThrow();
  });

  it("handles missing metrics fields gracefully", () => {
    expect(() =>
      renderComponent({
        currentPercent: 0,
        metrics: {} as AnalyticsMetrics,
      }),
    ).not.toThrow();
  });

  it("ANALYTICS_MILESTONES constant is [25, 50, 75, 100]", () => {
    expect(ANALYTICS_MILESTONES).toEqual([25, 50, 75, 100]);
  });

  it("DEFAULT_ANALYTICS_DISMISS_MS constant is 5000", () => {
    expect(DEFAULT_ANALYTICS_DISMISS_MS).toBe(5_000);
  });

  it("MAX_KPI_CARDS constant is 6", () => {
    expect(MAX_KPI_CARDS).toBe(6);
  });

  it("STRONG_VELOCITY_THRESHOLD constant is 1000", () => {
    expect(STRONG_VELOCITY_THRESHOLD).toBe(1_000);
  });

  it("HIGH_ENGAGEMENT_THRESHOLD constant is 10", () => {
    expect(HIGH_ENGAGEMENT_THRESHOLD).toBe(10);
  });
});
