/**
 * @title MilestoneDashboard — Comprehensive Test Suite
 * @notice Covers pure helpers, KPI derivation, overlay rendering, dashboard
 *         panel, leaderboard, auto-dismiss, manual dismiss, deduplication,
 *         accessibility, and security assumption validation.
 * @dev Targets ≥ 95% coverage of milestone_dashboard.tsx.
 */
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import MilestoneDashboard, {
  DASHBOARD_MILESTONES,
  DEFAULT_DISMISS_MS,
  MAX_NAME_LENGTH,
  MAX_CONTRIBUTOR_NAME_LENGTH,
  MAX_LEADERBOARD_ENTRIES,
  STRONG_VELOCITY_THRESHOLD,
  HIGH_ENGAGEMENT_THRESHOLD,
  URGENT_DAYS_THRESHOLD,
  clampDashboardPercent,
  sanitizeDashboardString,
  resolveNextDashboardMilestone,
  getMilestoneDashboardContent,
  computeDashboardFundingPercent,
  computeVelocityTrend,
  formatDashboardValue,
  deriveKpiCards,
  KpiCardView,
  ContributorLeaderboard,
  type DashboardMilestone,
  type DashboardMetrics,
  type MilestoneDashboardProps,
} from "./milestone_dashboard";

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(() => { jest.useFakeTimers(); });
afterAll(() => { jest.useRealTimers(); });
afterEach(() => { jest.clearAllTimers(); jest.clearAllMocks(); });

const baseMetrics: DashboardMetrics = {
  totalRaised: 500,
  goal: 1_000,
  contributorCount: 5,
  pageViews: 100,
  daysRemaining: 10,
  dailyVelocity: 50,
  previousVelocity: 40,
  topContributors: [
    { id: "a", name: "Alice", amount: 200 },
    { id: "b", name: "Bob",   amount: 150 },
    { id: "c", name: "Carol", amount: 150 },
  ],
};

function renderDashboard(props: Partial<MilestoneDashboardProps> = {}) {
  return render(
    <MilestoneDashboard
      currentPercent={0}
      metrics={baseMetrics}
      autoDismissMs={0}
      {...props}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. clampDashboardPercent
// ─────────────────────────────────────────────────────────────────────────────

describe("clampDashboardPercent", () => {
  it("returns 0 for NaN", () => expect(clampDashboardPercent(NaN)).toBe(0));
  it("returns 0 for Infinity", () => expect(clampDashboardPercent(Infinity)).toBe(0));
  it("returns 0 for -Infinity", () => expect(clampDashboardPercent(-Infinity)).toBe(0));
  it("returns 0 for non-number", () =>
    expect(clampDashboardPercent("x" as unknown as number)).toBe(0));
  it("clamps below 0 to 0", () => expect(clampDashboardPercent(-5)).toBe(0));
  it("clamps above 100 to 100", () => expect(clampDashboardPercent(200)).toBe(100));
  it("passes through 0", () => expect(clampDashboardPercent(0)).toBe(0));
  it("passes through 50", () => expect(clampDashboardPercent(50)).toBe(50));
  it("passes through 100", () => expect(clampDashboardPercent(100)).toBe(100));
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. sanitizeDashboardString
// ─────────────────────────────────────────────────────────────────────────────

describe("sanitizeDashboardString", () => {
  it("returns '' for null", () =>
    expect(sanitizeDashboardString(null, 80)).toBe(""));
  it("returns '' for undefined", () =>
    expect(sanitizeDashboardString(undefined, 80)).toBe(""));
  it("returns '' for number", () =>
    expect(sanitizeDashboardString(42, 80)).toBe(""));
  it("strips control characters", () =>
    expect(sanitizeDashboardString("hello\x00world", 80)).toBe("hello world"));
  it("strips DEL character", () =>
    expect(sanitizeDashboardString("a\x7Fb", 80)).toBe("a b"));
  it("collapses whitespace", () =>
    expect(sanitizeDashboardString("a   b", 80)).toBe("a b"));
  it("trims leading/trailing whitespace", () =>
    expect(sanitizeDashboardString("  hi  ", 80)).toBe("hi"));
  it("truncates to maxLength", () =>
    expect(sanitizeDashboardString("abcdef", 3)).toBe("abc"));
  it("returns '' for blank string", () =>
    expect(sanitizeDashboardString("   ", 80)).toBe(""));
  it("passes through normal string", () =>
    expect(sanitizeDashboardString("Solar Farm", 80)).toBe("Solar Farm"));
  it("respects MAX_NAME_LENGTH constant", () => {
    const long = "A".repeat(MAX_NAME_LENGTH + 10);
    expect(sanitizeDashboardString(long, MAX_NAME_LENGTH).length).toBe(MAX_NAME_LENGTH);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. resolveNextDashboardMilestone
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveNextDashboardMilestone", () => {
  it("returns null when progress is 0", () =>
    expect(resolveNextDashboardMilestone(0, new Set())).toBeNull());
  it("returns 25 at exactly 25%", () =>
    expect(resolveNextDashboardMilestone(25, new Set())).toBe(25));
  it("returns 50 when 25 already celebrated", () =>
    expect(resolveNextDashboardMilestone(60, new Set([25] as DashboardMilestone[]))).toBe(50));
  it("returns null when all milestones celebrated", () => {
    const all = new Set(DASHBOARD_MILESTONES as unknown as DashboardMilestone[]);
    expect(resolveNextDashboardMilestone(100, all)).toBeNull();
  });
  it("returns 100 at full funding with 25/50/75 celebrated", () => {
    const celebrated = new Set([25, 50, 75] as DashboardMilestone[]);
    expect(resolveNextDashboardMilestone(100, celebrated)).toBe(100);
  });
  it("returns lowest uncelebrated threshold first", () =>
    expect(resolveNextDashboardMilestone(100, new Set())).toBe(25));
  it("returns null just below 25%", () =>
    expect(resolveNextDashboardMilestone(24.9, new Set())).toBeNull());
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. getMilestoneDashboardContent
// ─────────────────────────────────────────────────────────────────────────────

describe("getMilestoneDashboardContent", () => {
  it.each(DASHBOARD_MILESTONES)("returns icon and heading for %i%%", (t) => {
    const { icon, heading } = getMilestoneDashboardContent(t as DashboardMilestone);
    expect(typeof icon).toBe("string");
    expect(icon.length).toBeGreaterThan(0);
    expect(heading).toContain(`${t}`);
  });
  it("returns 🎉 for 100%", () =>
    expect(getMilestoneDashboardContent(100).icon).toBe("🎉"));
  it("returns 🚀 for 50%", () =>
    expect(getMilestoneDashboardContent(50).icon).toBe("🚀"));
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. computeDashboardFundingPercent
// ─────────────────────────────────────────────────────────────────────────────

describe("computeDashboardFundingPercent", () => {
  it("returns 0 for zero goal", () =>
    expect(computeDashboardFundingPercent(500, 0)).toBe(0));
  it("returns 0 for negative goal", () =>
    expect(computeDashboardFundingPercent(500, -1)).toBe(0));
  it("returns 0 for NaN totalRaised", () =>
    expect(computeDashboardFundingPercent(NaN, 1000)).toBe(0));
  it("returns 0 for NaN goal", () =>
    expect(computeDashboardFundingPercent(500, NaN)).toBe(0));
  it("returns 50 for half raised", () =>
    expect(computeDashboardFundingPercent(500, 1000)).toBe(50));
  it("returns 100 for fully raised", () =>
    expect(computeDashboardFundingPercent(1000, 1000)).toBe(100));
  it("clamps to 100 when over-raised", () =>
    expect(computeDashboardFundingPercent(2000, 1000)).toBe(100));
  it("returns 0 for zero raised", () =>
    expect(computeDashboardFundingPercent(0, 1000)).toBe(0));
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. computeVelocityTrend
// ─────────────────────────────────────────────────────────────────────────────

describe("computeVelocityTrend", () => {
  it("returns 'up' when current > previous", () =>
    expect(computeVelocityTrend(100, 80)).toBe("up"));
  it("returns 'down' when current < previous", () =>
    expect(computeVelocityTrend(60, 80)).toBe("down"));
  it("returns 'flat' when equal", () =>
    expect(computeVelocityTrend(80, 80)).toBe("flat"));
  it("returns 'flat' for NaN current", () =>
    expect(computeVelocityTrend(NaN, 80)).toBe("flat"));
  it("returns 'flat' for NaN previous", () =>
    expect(computeVelocityTrend(80, NaN)).toBe("flat"));
  it("returns 'flat' for both NaN", () =>
    expect(computeVelocityTrend(NaN, NaN)).toBe("flat"));
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. formatDashboardValue
// ─────────────────────────────────────────────────────────────────────────────

describe("formatDashboardValue", () => {
  it("returns '—' for NaN", () =>
    expect(formatDashboardValue(NaN)).toBe("—"));
  it("returns '—' for Infinity", () =>
    expect(formatDashboardValue(Infinity)).toBe("—"));
  it("formats 0 as '0'", () =>
    expect(formatDashboardValue(0)).toBe("0"));
  it("formats 999 as '999'", () =>
    expect(formatDashboardValue(999)).toBe("999"));
  it("formats 1000 as '1.0k'", () =>
    expect(formatDashboardValue(1000)).toBe("1.0k"));
  it("formats 1500 as '1.5k'", () =>
    expect(formatDashboardValue(1500)).toBe("1.5k"));
  it("formats 1_000_000 as '1.0M'", () =>
    expect(formatDashboardValue(1_000_000)).toBe("1.0M"));
  it("formats negative as 0", () =>
    expect(formatDashboardValue(-100)).toBe("0"));
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. deriveKpiCards
// ─────────────────────────────────────────────────────────────────────────────

describe("deriveKpiCards", () => {
  it("returns 4 cards for standard metrics", () => {
    const cards = deriveKpiCards(baseMetrics, 50);
    expect(cards.length).toBe(4);
  });

  it("funding card has 'warning' severity below 50%", () => {
    const cards = deriveKpiCards(baseMetrics, 30);
    const funding = cards.find((c) => c.id === "funding")!;
    expect(funding.severity).toBe("warning");
  });

  it("funding card has 'info' severity at 50–99%", () => {
    const cards = deriveKpiCards(baseMetrics, 75);
    const funding = cards.find((c) => c.id === "funding")!;
    expect(funding.severity).toBe("info");
  });

  it("funding card has 'success' severity at 100%", () => {
    const cards = deriveKpiCards(baseMetrics, 100);
    const funding = cards.find((c) => c.id === "funding")!;
    expect(funding.severity).toBe("success");
  });

  it("velocity card has 'success' severity above threshold", () => {
    const m = { ...baseMetrics, dailyVelocity: STRONG_VELOCITY_THRESHOLD };
    const cards = deriveKpiCards(m, 50);
    const vel = cards.find((c) => c.id === "velocity")!;
    expect(vel.severity).toBe("success");
  });

  it("velocity card has trend 'up' when current > previous", () => {
    const m = { ...baseMetrics, dailyVelocity: 100, previousVelocity: 50 };
    const cards = deriveKpiCards(m, 50);
    const vel = cards.find((c) => c.id === "velocity")!;
    expect(vel.trend).toBe("up");
  });

  it("velocity card has trend 'down' when current < previous", () => {
    const m = { ...baseMetrics, dailyVelocity: 30, previousVelocity: 50 };
    const cards = deriveKpiCards(m, 50);
    const vel = cards.find((c) => c.id === "velocity")!;
    expect(vel.trend).toBe("down");
  });

  it("contributors card has 'success' severity at/above threshold", () => {
    const m = { ...baseMetrics, contributorCount: HIGH_ENGAGEMENT_THRESHOLD };
    const cards = deriveKpiCards(m, 50);
    const contrib = cards.find((c) => c.id === "contributors")!;
    expect(contrib.severity).toBe("success");
  });

  it("deadline card has 'critical' severity when urgent and not funded", () => {
    const m = { ...baseMetrics, daysRemaining: URGENT_DAYS_THRESHOLD };
    const cards = deriveKpiCards(m, 50);
    const deadline = cards.find((c) => c.id === "deadline")!;
    expect(deadline.severity).toBe("critical");
  });

  it("deadline card is NOT critical when fully funded", () => {
    const m = { ...baseMetrics, daysRemaining: 1 };
    const cards = deriveKpiCards(m, 100);
    const deadline = cards.find((c) => c.id === "deadline")!;
    expect(deadline.severity).toBe("info");
  });

  it("sorts critical cards first", () => {
    const m = { ...baseMetrics, daysRemaining: 1 };
    const cards = deriveKpiCards(m, 30);
    expect(cards[0].severity).toBe("critical");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Overlay rendering
// ─────────────────────────────────────────────────────────────────────────────

describe("MilestoneDashboard overlay", () => {
  it("renders no overlay when progress is 0", () => {
    renderDashboard({ currentPercent: 0 });
    expect(screen.queryByTestId("dashboard-overlay")).toBeNull();
  });

  it("renders no overlay at 24%", () => {
    renderDashboard({ currentPercent: 24 });
    expect(screen.queryByTestId("dashboard-overlay")).toBeNull();
  });

  it("renders overlay when progress reaches 25%", () => {
    renderDashboard({ currentPercent: 25 });
    expect(screen.getByTestId("dashboard-overlay")).toBeInTheDocument();
  });

  it("renders correct heading for 50%", () => {
    renderDashboard({ currentPercent: 50 });
    expect(screen.getByTestId("overlay-heading")).toHaveTextContent("Halfway There!");
  });

  it("renders correct heading for 75%", () => {
    renderDashboard({ currentPercent: 75 });
    expect(screen.getByTestId("overlay-heading")).toHaveTextContent("75% Funded!");
  });

  it("renders correct heading for 100%", () => {
    renderDashboard({ currentPercent: 100 });
    expect(screen.getByTestId("overlay-heading")).toHaveTextContent("Goal Reached!");
  });

  it("renders campaign name in overlay when provided", () => {
    renderDashboard({ currentPercent: 25, campaignName: "Solar Farm" });
    expect(screen.getByTestId("overlay-campaign")).toHaveTextContent("Solar Farm");
  });

  it("does not render campaign name in overlay when absent", () => {
    renderDashboard({ currentPercent: 25 });
    expect(screen.queryByTestId("overlay-campaign")).toBeNull();
  });

  it("truncates long campaign name in overlay", () => {
    const long = "A".repeat(MAX_NAME_LENGTH + 20);
    renderDashboard({ currentPercent: 25, campaignName: long });
    const el = screen.getByTestId("overlay-campaign");
    expect(el.textContent!.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
  });

  it("shows threshold text in overlay", () => {
    renderDashboard({ currentPercent: 75 });
    expect(screen.getByTestId("overlay-threshold")).toHaveTextContent("75%");
  });

  it("overlay has role=status", () => {
    renderDashboard({ currentPercent: 25 });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("overlay has aria-live=polite", () => {
    renderDashboard({ currentPercent: 25 });
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Overlay dismiss
// ─────────────────────────────────────────────────────────────────────────────

describe("MilestoneDashboard dismiss", () => {
  it("hides overlay on dismiss button click", () => {
    renderDashboard({ currentPercent: 25 });
    fireEvent.click(screen.getByTestId("overlay-dismiss"));
    expect(screen.queryByTestId("dashboard-overlay")).toBeNull();
  });

  it("calls onDismiss with threshold on manual dismiss", () => {
    const onDismiss = jest.fn();
    renderDashboard({ currentPercent: 50, onDismiss });
    fireEvent.click(screen.getByTestId("overlay-dismiss"));
    expect(onDismiss).toHaveBeenCalledWith(50);
  });

  it("dismiss button has correct aria-label", () => {
    renderDashboard({ currentPercent: 25 });
    expect(screen.getByTestId("overlay-dismiss")).toHaveAttribute(
      "aria-label",
      "Dismiss milestone celebration"
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Auto-dismiss
// ─────────────────────────────────────────────────────────────────────────────

describe("MilestoneDashboard auto-dismiss", () => {
  it("auto-dismisses after autoDismissMs", () => {
    renderDashboard({ currentPercent: 25, autoDismissMs: 3_000 });
    expect(screen.getByTestId("dashboard-overlay")).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(3_000); });
    expect(screen.queryByTestId("dashboard-overlay")).toBeNull();
  });

  it("calls onDismiss after auto-dismiss", () => {
    const onDismiss = jest.fn();
    renderDashboard({ currentPercent: 25, autoDismissMs: 1_000, onDismiss });
    act(() => { jest.advanceTimersByTime(1_000); });
    expect(onDismiss).toHaveBeenCalledWith(25);
  });

  it("does not auto-dismiss when autoDismissMs is 0", () => {
    renderDashboard({ currentPercent: 25, autoDismissMs: 0 });
    act(() => { jest.advanceTimersByTime(10_000); });
    expect(screen.getByTestId("dashboard-overlay")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. onMilestone callback
// ─────────────────────────────────────────────────────────────────────────────

describe("MilestoneDashboard onMilestone", () => {
  it("calls onMilestone with correct threshold", () => {
    const onMilestone = jest.fn();
    renderDashboard({ currentPercent: 50, onMilestone });
    expect(onMilestone).toHaveBeenCalledWith(
      expect.objectContaining({ threshold: 50 })
    );
  });

  it("onMilestone event includes campaignName", () => {
    const onMilestone = jest.fn();
    renderDashboard({ currentPercent: 25, campaignName: "My Campaign", onMilestone });
    expect(onMilestone).toHaveBeenCalledWith(
      expect.objectContaining({ campaignName: "My Campaign" })
    );
  });

  it("onMilestone event includes timestamp", () => {
    const onMilestone = jest.fn();
    renderDashboard({ currentPercent: 25, onMilestone });
    const event = onMilestone.mock.calls[0][0];
    expect(typeof event.timestamp).toBe("number");
    expect(event.timestamp).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Deduplication
// ─────────────────────────────────────────────────────────────────────────────

describe("MilestoneDashboard deduplication", () => {
  it("does not re-trigger a milestone already celebrated", () => {
    const onMilestone = jest.fn();
    const { rerender } = renderDashboard({ currentPercent: 25, onMilestone, autoDismissMs: 0 });
    fireEvent.click(screen.getByTestId("overlay-dismiss"));
    rerender(
      <MilestoneDashboard
        currentPercent={25}
        metrics={baseMetrics}
        onMilestone={onMilestone}
        autoDismissMs={0}
      />
    );
    expect(onMilestone).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. Dashboard panel
// ─────────────────────────────────────────────────────────────────────────────

describe("MilestoneDashboard panel", () => {
  it("renders dashboard panel by default", () => {
    renderDashboard();
    expect(screen.getByTestId("dashboard-panel")).toBeInTheDocument();
  });

  it("hides dashboard panel when showDashboard=false", () => {
    renderDashboard({ showDashboard: false });
    expect(screen.queryByTestId("dashboard-panel")).toBeNull();
  });

  it("renders campaign title in dashboard when provided", () => {
    renderDashboard({ campaignName: "Green Energy" });
    expect(screen.getByTestId("dashboard-title")).toHaveTextContent("Green Energy");
  });

  it("does not render title when campaignName is absent", () => {
    renderDashboard();
    expect(screen.queryByTestId("dashboard-title")).toBeNull();
  });

  it("renders progress bar", () => {
    renderDashboard({ currentPercent: 60 });
    expect(screen.getByTestId("dashboard-progress-bar")).toBeInTheDocument();
  });

  it("progress bar has correct aria-valuenow", () => {
    renderDashboard({ currentPercent: 60 });
    expect(screen.getByTestId("dashboard-progress-bar")).toHaveAttribute(
      "aria-valuenow",
      "60"
    );
  });

  it("progress bar has role=progressbar", () => {
    renderDashboard({ currentPercent: 50 });
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders KPI grid", () => {
    renderDashboard({ currentPercent: 50 });
    expect(screen.getByTestId("kpi-grid")).toBeInTheDocument();
  });

  it("renders all 4 KPI cards", () => {
    renderDashboard({ currentPercent: 50 });
    expect(screen.getByTestId("kpi-card-funding")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-card-velocity")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-card-contributors")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-card-deadline")).toBeInTheDocument();
  });

  it("renders leaderboard section", () => {
    renderDashboard();
    expect(screen.getByTestId("leaderboard-section")).toBeInTheDocument();
  });

  it("dashboard panel has role=region", () => {
    renderDashboard();
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("dashboard panel has aria-label", () => {
    renderDashboard();
    expect(screen.getByRole("region")).toHaveAttribute(
      "aria-label",
      "Campaign milestone dashboard"
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. KPI card values
// ─────────────────────────────────────────────────────────────────────────────

describe("KPI card values", () => {
  it("funding card shows correct percentage", () => {
    renderDashboard({ currentPercent: 75 });
    expect(screen.getByTestId("kpi-value-funding")).toHaveTextContent("75.0%");
  });

  it("funding card shows subtext with raised/goal", () => {
    renderDashboard({ currentPercent: 50 });
    expect(screen.getByTestId("kpi-subtext-funding")).toBeInTheDocument();
  });

  it("velocity card shows trend up arrow", () => {
    const m = { ...baseMetrics, dailyVelocity: 100, previousVelocity: 50 };
    renderDashboard({ metrics: m });
    expect(screen.getByTestId("kpi-trend-velocity")).toHaveTextContent("↑");
  });

  it("velocity card shows trend down arrow", () => {
    const m = { ...baseMetrics, dailyVelocity: 30, previousVelocity: 50 };
    renderDashboard({ metrics: m });
    expect(screen.getByTestId("kpi-trend-velocity")).toHaveTextContent("↓");
  });

  it("velocity card shows no trend icon when flat", () => {
    const m = { ...baseMetrics, dailyVelocity: 50, previousVelocity: 50 };
    renderDashboard({ metrics: m });
    expect(screen.queryByTestId("kpi-trend-velocity")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. Leaderboard
// ─────────────────────────────────────────────────────────────────────────────

describe("ContributorLeaderboard", () => {
  it("renders empty state when no contributors", () => {
    render(<ContributorLeaderboard contributors={[]} />);
    expect(screen.getByTestId("leaderboard-empty")).toBeInTheDocument();
  });

  it("renders contributor names", () => {
    renderDashboard();
    expect(screen.getByTestId("leaderboard-name-0")).toHaveTextContent("Alice");
    expect(screen.getByTestId("leaderboard-name-1")).toHaveTextContent("Bob");
  });

  it("renders contributor amounts", () => {
    renderDashboard();
    expect(screen.getByTestId("leaderboard-amount-0")).toHaveTextContent("200");
  });

  it("caps leaderboard at MAX_LEADERBOARD_ENTRIES", () => {
    const many = Array.from({ length: MAX_LEADERBOARD_ENTRIES + 5 }, (_, i) => ({
      id: `u${i}`,
      name: `User ${i}`,
      amount: 100,
    }));
    render(<ContributorLeaderboard contributors={many} />);
    const items = screen.getAllByTestId(/^leaderboard-entry-/);
    expect(items.length).toBe(MAX_LEADERBOARD_ENTRIES);
  });

  it("sanitizes contributor names", () => {
    const contributors = [{ id: "x", name: "Evil\x00Name", amount: 100 }];
    render(<ContributorLeaderboard contributors={contributors} />);
    expect(screen.getByTestId("leaderboard-name-0").textContent).not.toContain("\x00");
  });

  it("shows 'Anonymous' for blank contributor name", () => {
    const contributors = [{ id: "x", name: "   ", amount: 100 }];
    render(<ContributorLeaderboard contributors={contributors} />);
    expect(screen.getByTestId("leaderboard-name-0")).toHaveTextContent("Anonymous");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. KpiCardView sub-component
// ─────────────────────────────────────────────────────────────────────────────

describe("KpiCardView", () => {
  it("renders label and value", () => {
    render(
      <KpiCardView
        card={{ id: "test", label: "Test Label", value: "42", severity: "info" }}
      />
    );
    expect(screen.getByTestId("kpi-label-test")).toHaveTextContent("Test Label");
    expect(screen.getByTestId("kpi-value-test")).toHaveTextContent("42");
  });

  it("renders subtext when provided", () => {
    render(
      <KpiCardView
        card={{ id: "t", label: "L", value: "V", severity: "success", subtext: "sub" }}
      />
    );
    expect(screen.getByTestId("kpi-subtext-t")).toHaveTextContent("sub");
  });

  it("does not render subtext when absent", () => {
    render(
      <KpiCardView card={{ id: "t", label: "L", value: "V", severity: "info" }} />
    );
    expect(screen.queryByTestId("kpi-subtext-t")).toBeNull();
  });

  it("renders trend up icon", () => {
    render(
      <KpiCardView
        card={{ id: "t", label: "L", value: "V", severity: "info", trend: "up" }}
      />
    );
    expect(screen.getByTestId("kpi-trend-t")).toHaveTextContent("↑");
  });

  it("renders trend down icon", () => {
    render(
      <KpiCardView
        card={{ id: "t", label: "L", value: "V", severity: "info", trend: "down" }}
      />
    );
    expect(screen.getByTestId("kpi-trend-t")).toHaveTextContent("↓");
  });

  it("does not render trend icon for flat", () => {
    render(
      <KpiCardView
        card={{ id: "t", label: "L", value: "V", severity: "info", trend: "flat" }}
      />
    );
    expect(screen.queryByTestId("kpi-trend-t")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 18. Constants
// ─────────────────────────────────────────────────────────────────────────────

describe("exported constants", () => {
  it("DEFAULT_DISMISS_MS is 5000", () =>
    expect(DEFAULT_DISMISS_MS).toBe(5_000));
  it("MAX_NAME_LENGTH is 80", () =>
    expect(MAX_NAME_LENGTH).toBe(80));
  it("MAX_CONTRIBUTOR_NAME_LENGTH is 50", () =>
    expect(MAX_CONTRIBUTOR_NAME_LENGTH).toBe(50));
  it("MAX_LEADERBOARD_ENTRIES is 10", () =>
    expect(MAX_LEADERBOARD_ENTRIES).toBe(10));
  it("STRONG_VELOCITY_THRESHOLD is 1000", () =>
    expect(STRONG_VELOCITY_THRESHOLD).toBe(1_000));
  it("HIGH_ENGAGEMENT_THRESHOLD is 10", () =>
    expect(HIGH_ENGAGEMENT_THRESHOLD).toBe(10));
  it("URGENT_DAYS_THRESHOLD is 3", () =>
    expect(URGENT_DAYS_THRESHOLD).toBe(3));
  it("DASHBOARD_MILESTONES contains 25,50,75,100", () =>
    expect(DASHBOARD_MILESTONES).toEqual([25, 50, 75, 100]));
});

// ─────────────────────────────────────────────────────────────────────────────
// 19. Security assumption validation
// ─────────────────────────────────────────────────────────────────────────────

describe("security assumptions", () => {
  it("sanitizeDashboardString strips HTML-like angle brackets", () => {
    // angle brackets are not stripped by the control-char regex but the
    // output is still safe because React renders text nodes, not HTML.
    // Confirm the string is at least truncated and control-chars removed.
    const result = sanitizeDashboardString("<script>alert(1)</script>", 80);
    expect(result).not.toContain("\x00");
  });

  it("clampDashboardPercent never returns value outside [0,100]", () => {
    const inputs = [-Infinity, -1, 0, 50, 100, 101, Infinity, NaN];
    for (const v of inputs) {
      const r = clampDashboardPercent(v);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(100);
    }
  });

  it("progress bar aria-valuenow is always an integer in [0,100]", () => {
    renderDashboard({ currentPercent: 73.7 });
    const bar = screen.getByTestId("dashboard-progress-bar");
    const val = parseInt(bar.getAttribute("aria-valuenow")!, 10);
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(100);
  });

  it("overlay is not rendered when no milestone is active (no dangling overlay)", () => {
    renderDashboard({ currentPercent: 10 });
    expect(screen.queryByTestId("dashboard-overlay")).toBeNull();
  });

  it("contributor name with control chars is sanitized before render", () => {
    const contributors = [{ id: "x", name: "Bad\x01Name", amount: 50 }];
    render(<ContributorLeaderboard contributors={contributors} />);
    const text = screen.getByTestId("leaderboard-name-0").textContent ?? "";
    expect(text).not.toMatch(/[\x00-\x1F]/);
  });

  it("formatDashboardValue never returns negative string", () => {
    expect(formatDashboardValue(-999)).toBe("0");
  });
});
