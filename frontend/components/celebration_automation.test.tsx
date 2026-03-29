/**
 * @title CelebrationAutomation — Comprehensive Test Suite
 * @notice Covers pure helpers, component rendering, milestone automation,
 *         deduplication, auto-dismiss, manual dismiss, and accessibility.
 * @dev Targets ≥ 95% coverage of celebration_automation.tsx.
 */
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import CelebrationAutomation, {
  AUTOMATION_MILESTONES,
  DEFAULT_AUTO_DISMISS_MS,
  MAX_CAMPAIGN_NAME_LENGTH,
  MAX_LABEL_LENGTH,
  clampProgress,
  getMilestoneContent,
  resolveNextMilestone,
  sanitizeLabel,
  type AutomationThreshold,
  type CelebrationAutomationProps,
} from "./celebration_automation";

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(() => {
  jest.useFakeTimers();
});
afterAll(() => {
  jest.useRealTimers();
});
afterEach(() => {
  jest.clearAllTimers();
  jest.clearAllMocks();
});

function renderComponent(props: Partial<CelebrationAutomationProps> = {}) {
  return render(
    <CelebrationAutomation currentPercent={0} autoDismissMs={0} {...props} />
  );
}

// ── clampProgress ─────────────────────────────────────────────────────────────

describe("clampProgress", () => {
  it("returns 0 for NaN", () => expect(clampProgress(NaN)).toBe(0));
  it("returns 0 for non-number", () => expect(clampProgress("x" as unknown as number)).toBe(0));
  it("clamps below 0 to 0", () => expect(clampProgress(-10)).toBe(0));
  it("clamps above 100 to 100", () => expect(clampProgress(150)).toBe(100));
  it("passes through 0", () => expect(clampProgress(0)).toBe(0));
  it("passes through 50", () => expect(clampProgress(50)).toBe(50));
  it("passes through 100", () => expect(clampProgress(100)).toBe(100));
});

// ── sanitizeLabel ─────────────────────────────────────────────────────────────

describe("sanitizeLabel", () => {
  it("returns empty string for non-string", () => {
    expect(sanitizeLabel(null, 60)).toBe("");
    expect(sanitizeLabel(undefined, 60)).toBe("");
    expect(sanitizeLabel(42, 60)).toBe("");
  });
  it("strips control characters", () => {
    expect(sanitizeLabel("hello\x00world", 60)).toBe("hello world");
  });
  it("collapses whitespace", () => {
    expect(sanitizeLabel("a   b", 60)).toBe("a b");
  });
  it("truncates to maxLength", () => {
    expect(sanitizeLabel("abcdef", 3)).toBe("abc");
  });
  it("returns empty string for blank input", () => {
    expect(sanitizeLabel("   ", 60)).toBe("");
  });
  it("passes through normal string", () => {
    expect(sanitizeLabel("Solar Farm", 60)).toBe("Solar Farm");
  });
});

// ── resolveNextMilestone ──────────────────────────────────────────────────────

describe("resolveNextMilestone", () => {
  it("returns null when progress is 0", () => {
    expect(resolveNextMilestone(0, new Set())).toBeNull();
  });
  it("returns 25 when progress is exactly 25", () => {
    expect(resolveNextMilestone(25, new Set())).toBe(25);
  });
  it("returns 50 when 25 already celebrated", () => {
    expect(resolveNextMilestone(60, new Set([25] as AutomationThreshold[]))).toBe(50);
  });
  it("returns null when all milestones celebrated", () => {
    const all = new Set(AUTOMATION_MILESTONES as unknown as AutomationThreshold[]);
    expect(resolveNextMilestone(100, all)).toBeNull();
  });
  it("returns 100 at full funding", () => {
    const celebrated = new Set([25, 50, 75] as AutomationThreshold[]);
    expect(resolveNextMilestone(100, celebrated)).toBe(100);
  });
  it("returns lowest uncelebrated threshold first", () => {
    expect(resolveNextMilestone(100, new Set())).toBe(25);
  });
});

// ── getMilestoneContent ───────────────────────────────────────────────────────

describe("getMilestoneContent", () => {
  it.each(AUTOMATION_MILESTONES)("returns icon and heading for %i%%", (t) => {
    const { icon, heading } = getMilestoneContent(t as AutomationThreshold);
    expect(typeof icon).toBe("string");
    expect(icon.length).toBeGreaterThan(0);
    expect(heading).toContain(`${t}`);
  });
});

// ── Component: renders nothing below first threshold ─────────────────────────

describe("CelebrationAutomation rendering", () => {
  it("renders nothing when progress is 0", () => {
    renderComponent({ currentPercent: 0 });
    expect(screen.queryByTestId("celebration-overlay")).toBeNull();
  });

  it("renders nothing when progress is 24", () => {
    renderComponent({ currentPercent: 24 });
    expect(screen.queryByTestId("celebration-overlay")).toBeNull();
  });

  it("renders overlay when progress reaches 25", () => {
    renderComponent({ currentPercent: 25 });
    expect(screen.getByTestId("celebration-overlay")).toBeInTheDocument();
  });

  it("renders correct heading for 50% milestone", () => {
    renderComponent({ currentPercent: 50 });
    expect(screen.getByTestId("celebration-heading")).toHaveTextContent("Halfway There!");
  });

  it("renders correct heading for 100% milestone", () => {
    renderComponent({ currentPercent: 100 });
    expect(screen.getByTestId("celebration-heading")).toHaveTextContent("Goal Reached!");
  });

  it("renders campaign name when provided", () => {
    renderComponent({ currentPercent: 25, campaignName: "Solar Farm" });
    expect(screen.getByTestId("celebration-campaign")).toHaveTextContent("Solar Farm");
  });

  it("does not render campaign name when absent", () => {
    renderComponent({ currentPercent: 25 });
    expect(screen.queryByTestId("celebration-campaign")).toBeNull();
  });

  it("truncates long campaign name", () => {
    const long = "A".repeat(MAX_CAMPAIGN_NAME_LENGTH + 10);
    renderComponent({ currentPercent: 25, campaignName: long });
    const el = screen.getByTestId("celebration-campaign");
    expect(el.textContent!.length).toBeLessThanOrEqual(MAX_CAMPAIGN_NAME_LENGTH);
  });

  it("shows threshold in overlay", () => {
    renderComponent({ currentPercent: 75 });
    expect(screen.getByTestId("celebration-threshold")).toHaveTextContent("75%");
  });
});

// ── Component: dismiss ────────────────────────────────────────────────────────

describe("CelebrationAutomation dismiss", () => {
  it("hides overlay on dismiss button click", () => {
    renderComponent({ currentPercent: 25 });
    fireEvent.click(screen.getByTestId("dismiss-button"));
    expect(screen.queryByTestId("celebration-overlay")).toBeNull();
  });

  it("calls onDismiss with threshold when dismissed", () => {
    const onDismiss = jest.fn();
    renderComponent({ currentPercent: 50, onDismiss });
    fireEvent.click(screen.getByTestId("dismiss-button"));
    expect(onDismiss).toHaveBeenCalledWith(50);
  });

  it("dismiss button has aria-label", () => {
    renderComponent({ currentPercent: 25 });
    expect(screen.getByTestId("dismiss-button")).toHaveAttribute("aria-label", "Dismiss celebration");
  });
});

// ── Component: auto-dismiss ───────────────────────────────────────────────────

describe("CelebrationAutomation auto-dismiss", () => {
  it("auto-dismisses after autoDismissMs", () => {
    renderComponent({ currentPercent: 25, autoDismissMs: 3000 });
    expect(screen.getByTestId("celebration-overlay")).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(3000); });
    expect(screen.queryByTestId("celebration-overlay")).toBeNull();
  });

  it("calls onDismiss after auto-dismiss", () => {
    const onDismiss = jest.fn();
    renderComponent({ currentPercent: 25, autoDismissMs: 1000, onDismiss });
    act(() => { jest.advanceTimersByTime(1000); });
    expect(onDismiss).toHaveBeenCalledWith(25);
  });

  it("does not auto-dismiss when autoDismissMs is 0", () => {
    renderComponent({ currentPercent: 25, autoDismissMs: 0 });
    act(() => { jest.advanceTimersByTime(10_000); });
    expect(screen.getByTestId("celebration-overlay")).toBeInTheDocument();
  });
});

// ── Component: onCelebrate callback ──────────────────────────────────────────

describe("CelebrationAutomation onCelebrate", () => {
  it("calls onCelebrate with threshold when milestone is crossed", () => {
    const onCelebrate = jest.fn();
    renderComponent({ currentPercent: 50, onCelebrate });
    expect(onCelebrate).toHaveBeenCalledWith(50);
  });
});

// ── Component: deduplication ──────────────────────────────────────────────────

describe("CelebrationAutomation deduplication", () => {
  it("does not re-trigger a milestone already celebrated", () => {
    const onCelebrate = jest.fn();
    const { rerender } = renderComponent({ currentPercent: 25, onCelebrate, autoDismissMs: 0 });
    fireEvent.click(screen.getByTestId("dismiss-button"));
    rerender(<CelebrationAutomation currentPercent={25} onCelebrate={onCelebrate} autoDismissMs={0} />);
    expect(onCelebrate).toHaveBeenCalledTimes(1);
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe("CelebrationAutomation accessibility", () => {
  it("overlay has role=status", () => {
    renderComponent({ currentPercent: 25 });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("overlay has aria-live=polite", () => {
    renderComponent({ currentPercent: 25 });
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe("exported constants", () => {
  it("DEFAULT_AUTO_DISMISS_MS is 5000", () => expect(DEFAULT_AUTO_DISMISS_MS).toBe(5_000));
  it("MAX_CAMPAIGN_NAME_LENGTH is 60", () => expect(MAX_CAMPAIGN_NAME_LENGTH).toBe(60));
  it("MAX_LABEL_LENGTH is 80", () => expect(MAX_LABEL_LENGTH).toBe(80));
  it("AUTOMATION_MILESTONES contains 25,50,75,100", () => {
    expect(AUTOMATION_MILESTONES).toEqual([25, 50, 75, 100]);
  });
});
