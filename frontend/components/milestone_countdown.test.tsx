/**
 * @title MilestoneCountdown — Comprehensive Test Suite
 * @notice Covers pure helpers, component rendering, countdown ticking,
 *         milestone celebration, dismiss behaviour, and accessibility.
 * @dev Targets ≥ 95% coverage of milestone_countdown.tsx.
 */
import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MilestoneCountdown, {
  BPS_SCALE,
  MAX_MESSAGE_LENGTH,
  MAX_TITLE_LENGTH,
  TICK_MS,
  computeTimeLeft,
  isValidDeadline,
  isValidMilestone,
  padTwo,
  resolveTriggeredMilestone,
  sanitizeText,
  type Milestone,
  type MilestoneCountdownProps,
} from "./milestone_countdown";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW_MS = 1_000_000_000_000; // fixed "now" for deterministic tests
const DEADLINE_IN_1H = Math.floor(NOW_MS / 1_000) + 3_600; // 1 hour ahead
const DEADLINE_PAST = Math.floor(NOW_MS / 1_000) - 1; // already passed

const M50: Milestone = {
  thresholdBps: 5_000,
  title: "Halfway There!",
  message: "You have reached 50% of your goal.",
};

const M100: Milestone = {
  thresholdBps: 10_000,
  title: "Goal Reached!",
  message: "The campaign has hit its funding goal.",
};

function renderCountdown(props: Partial<MilestoneCountdownProps> = {}) {
  return render(
    <MilestoneCountdown
      deadlineUnix={DEADLINE_IN_1H}
      progressBps={0}
      nowFn={() => NOW_MS}
      {...props}
    />,
  );
}

// ── sanitizeText ──────────────────────────────────────────────────────────────

describe("sanitizeText", () => {
  it("returns empty string for non-string input", () => {
    expect(sanitizeText(null, 60)).toBe("");
    expect(sanitizeText(undefined, 60)).toBe("");
    expect(sanitizeText(42, 60)).toBe("");
    expect(sanitizeText({}, 60)).toBe("");
  });

  it("strips control characters", () => {
    expect(sanitizeText("hello\u0000world", 60)).toBe("hello world");
    expect(sanitizeText("tab\there", 60)).toBe("tab here");
  });

  it("collapses whitespace", () => {
    expect(sanitizeText("  too   many   spaces  ", 60)).toBe("too many spaces");
  });

  it("truncates to maxLen", () => {
    const long = "a".repeat(200);
    expect(sanitizeText(long, MAX_TITLE_LENGTH)).toHaveLength(MAX_TITLE_LENGTH);
    expect(sanitizeText(long, MAX_MESSAGE_LENGTH)).toHaveLength(MAX_MESSAGE_LENGTH);
  });

  it("returns empty string for whitespace-only input", () => {
    expect(sanitizeText("   ", 60)).toBe("");
  });

  it("preserves normal text unchanged", () => {
    expect(sanitizeText("Hello World", 60)).toBe("Hello World");
  });
});

// ── isValidDeadline ───────────────────────────────────────────────────────────

describe("isValidDeadline", () => {
  it("accepts positive integers", () => {
    expect(isValidDeadline(1_700_000_000)).toBe(true);
    expect(isValidDeadline(1)).toBe(true);
  });

  it("rejects zero and negatives", () => {
    expect(isValidDeadline(0)).toBe(false);
    expect(isValidDeadline(-1)).toBe(false);
  });

  it("rejects non-integers", () => {
    expect(isValidDeadline(1.5)).toBe(false);
    expect(isValidDeadline(NaN)).toBe(false);
    expect(isValidDeadline(Infinity)).toBe(false);
  });

  it("rejects non-numbers", () => {
    expect(isValidDeadline("1700000000")).toBe(false);
    expect(isValidDeadline(null)).toBe(false);
    expect(isValidDeadline(undefined)).toBe(false);
  });
});

// ── computeTimeLeft ───────────────────────────────────────────────────────────

describe("computeTimeLeft", () => {
  it("returns null when deadline has passed", () => {
    expect(computeTimeLeft(DEADLINE_PAST, NOW_MS)).toBeNull();
  });

  it("returns null when deadline equals now", () => {
    const exact = Math.floor(NOW_MS / 1_000);
    expect(computeTimeLeft(exact, NOW_MS)).toBeNull();
  });

  it("decomposes 1 hour correctly", () => {
    const result = computeTimeLeft(DEADLINE_IN_1H, NOW_MS);
    expect(result).toEqual({ days: 0, hours: 1, minutes: 0, seconds: 0 });
  });

  it("decomposes 1 day + 2 hours + 3 minutes + 4 seconds", () => {
    const deadline = Math.floor(NOW_MS / 1_000) + 86_400 + 7_200 + 180 + 4;
    const result = computeTimeLeft(deadline, NOW_MS);
    expect(result).toEqual({ days: 1, hours: 2, minutes: 3, seconds: 4 });
  });

  it("all fields are non-negative", () => {
    const result = computeTimeLeft(DEADLINE_IN_1H, NOW_MS);
    expect(result!.days).toBeGreaterThanOrEqual(0);
    expect(result!.hours).toBeGreaterThanOrEqual(0);
    expect(result!.minutes).toBeGreaterThanOrEqual(0);
    expect(result!.seconds).toBeGreaterThanOrEqual(0);
  });
});

// ── isValidMilestone ──────────────────────────────────────────────────────────

describe("isValidMilestone", () => {
  it("accepts valid milestones", () => {
    expect(isValidMilestone(M50)).toBe(true);
    expect(isValidMilestone({ thresholdBps: 1, title: "A", message: "B" })).toBe(true);
    expect(isValidMilestone({ thresholdBps: BPS_SCALE, title: "A", message: "B" })).toBe(true);
  });

  it("rejects threshold out of range", () => {
    expect(isValidMilestone({ thresholdBps: 0, title: "A", message: "B" })).toBe(false);
    expect(isValidMilestone({ thresholdBps: BPS_SCALE + 1, title: "A", message: "B" })).toBe(false);
    expect(isValidMilestone({ thresholdBps: -1, title: "A", message: "B" })).toBe(false);
  });

  it("rejects non-integer threshold", () => {
    expect(isValidMilestone({ thresholdBps: 5000.5, title: "A", message: "B" })).toBe(false);
  });

  it("rejects empty or missing title/message", () => {
    expect(isValidMilestone({ thresholdBps: 5_000, title: "", message: "B" })).toBe(false);
    expect(isValidMilestone({ thresholdBps: 5_000, title: "A", message: "" })).toBe(false);
    expect(isValidMilestone({ thresholdBps: 5_000, title: "   ", message: "B" })).toBe(false);
  });

  it("rejects null and non-objects", () => {
    expect(isValidMilestone(null)).toBe(false);
    expect(isValidMilestone("string")).toBe(false);
    expect(isValidMilestone(42)).toBe(false);
  });
});

// ── resolveTriggeredMilestone ─────────────────────────────────────────────────

describe("resolveTriggeredMilestone", () => {
  it("returns null when no milestones provided", () => {
    expect(resolveTriggeredMilestone(5_000, [])).toBeNull();
  });

  it("returns null when progress is below all thresholds", () => {
    expect(resolveTriggeredMilestone(4_999, [M50])).toBeNull();
  });

  it("returns the milestone at exact threshold", () => {
    expect(resolveTriggeredMilestone(5_000, [M50])).toEqual(M50);
  });

  it("returns the highest triggered milestone", () => {
    expect(resolveTriggeredMilestone(10_000, [M50, M100])).toEqual(M100);
  });

  it("skips invalid milestones", () => {
    const invalid = { thresholdBps: 0, title: "", message: "" } as Milestone;
    expect(resolveTriggeredMilestone(5_000, [invalid, M50])).toEqual(M50);
  });

  it("returns null when all milestones are invalid", () => {
    const invalid = { thresholdBps: 0, title: "", message: "" } as Milestone;
    expect(resolveTriggeredMilestone(5_000, [invalid])).toBeNull();
  });
});

// ── padTwo ────────────────────────────────────────────────────────────────────

describe("padTwo", () => {
  it("pads single digits", () => {
    expect(padTwo(0)).toBe("00");
    expect(padTwo(5)).toBe("05");
    expect(padTwo(9)).toBe("09");
  });

  it("does not pad two-digit numbers", () => {
    expect(padTwo(10)).toBe("10");
    expect(padTwo(59)).toBe("59");
  });

  it("does not truncate numbers > 99", () => {
    expect(padTwo(100)).toBe("100");
  });
});

// ── MilestoneCountdown — rendering ───────────────────────────────────────────

describe("MilestoneCountdown rendering", () => {
  it("renders nothing for invalid deadline", () => {
    const { container } = renderCountdown({ deadlineUnix: -1 });
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for non-integer deadline", () => {
    const { container } = renderCountdown({ deadlineUnix: 1.5 });
    expect(container.firstChild).toBeNull();
  });

  it("renders countdown units for a future deadline", () => {
    renderCountdown();
    expect(screen.getByTestId("days")).toBeInTheDocument();
    expect(screen.getByTestId("hours")).toBeInTheDocument();
    expect(screen.getByTestId("minutes")).toBeInTheDocument();
    expect(screen.getByTestId("seconds")).toBeInTheDocument();
  });

  it("shows '01' hours and '00' minutes/seconds for exactly 1 hour remaining", () => {
    renderCountdown();
    expect(screen.getByTestId("hours").textContent).toContain("01");
    expect(screen.getByTestId("minutes").textContent).toContain("00");
    expect(screen.getByTestId("seconds").textContent).toContain("00");
  });

  it("shows 'Campaign Ended' when deadline has passed", () => {
    renderCountdown({ deadlineUnix: DEADLINE_PAST });
    expect(screen.getByText("Campaign Ended")).toBeInTheDocument();
  });

  it("has correct ARIA region label", () => {
    renderCountdown();
    expect(screen.getByRole("region", { name: "Campaign countdown" })).toBeInTheDocument();
  });

  it("timer has role=timer", () => {
    renderCountdown();
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  it("ended state has role=status", () => {
    renderCountdown({ deadlineUnix: DEADLINE_PAST });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

// ── MilestoneCountdown — celebration banner ───────────────────────────────────

describe("MilestoneCountdown celebration banner", () => {
  it("does not show banner when progress is below threshold", () => {
    renderCountdown({ progressBps: 4_999, milestones: [M50] });
    expect(screen.queryByTestId("celebration-banner")).toBeNull();
  });

  it("shows banner when progress meets threshold", () => {
    renderCountdown({ progressBps: 5_000, milestones: [M50] });
    expect(screen.getByTestId("celebration-banner")).toBeInTheDocument();
    expect(screen.getByText("Halfway There!")).toBeInTheDocument();
    expect(screen.getByText("You have reached 50% of your goal.")).toBeInTheDocument();
  });

  it("shows the highest triggered milestone", () => {
    renderCountdown({ progressBps: 10_000, milestones: [M50, M100] });
    expect(screen.getByText("Goal Reached!")).toBeInTheDocument();
  });

  it("banner has role=alert for assertive announcement", () => {
    renderCountdown({ progressBps: 5_000, milestones: [M50] });
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("does not show banner when no milestones provided", () => {
    renderCountdown({ progressBps: 10_000, milestones: [] });
    expect(screen.queryByTestId("celebration-banner")).toBeNull();
  });
});

// ── MilestoneCountdown — dismiss behaviour ────────────────────────────────────

describe("MilestoneCountdown dismiss", () => {
  it("hides banner after dismiss button click", async () => {
    const user = userEvent.setup();
    renderCountdown({ progressBps: 5_000, milestones: [M50] });
    await user.click(screen.getByRole("button", { name: "Dismiss celebration" }));
    expect(screen.queryByTestId("celebration-banner")).toBeNull();
  });

  it("calls onMilestoneDismiss callback on dismiss", async () => {
    const user = userEvent.setup();
    const onDismiss = jest.fn();
    renderCountdown({
      progressBps: 5_000,
      milestones: [M50],
      onMilestoneDismiss: onDismiss,
    });
    await user.click(screen.getByRole("button", { name: "Dismiss celebration" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("re-shows banner when progressBps changes to a new milestone", async () => {
    const user = userEvent.setup();
    const { rerender } = renderCountdown({ progressBps: 5_000, milestones: [M50, M100] });
    await user.click(screen.getByRole("button", { name: "Dismiss celebration" }));
    expect(screen.queryByTestId("celebration-banner")).toBeNull();

    rerender(
      <MilestoneCountdown
        deadlineUnix={DEADLINE_IN_1H}
        progressBps={10_000}
        milestones={[M50, M100]}
        nowFn={() => NOW_MS}
      />,
    );
    expect(screen.getByTestId("celebration-banner")).toBeInTheDocument();
    expect(screen.getByText("Goal Reached!")).toBeInTheDocument();
  });
});

// ── MilestoneCountdown — countdown ticking ────────────────────────────────────

describe("MilestoneCountdown ticking", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("decrements seconds after one tick", () => {
    let now = NOW_MS;
    renderCountdown({ nowFn: () => now });

    act(() => {
      now += TICK_MS;
      jest.advanceTimersByTime(TICK_MS);
    });

    // After 1 s, seconds should show 59 (was 00 at exactly 1 h)
    expect(screen.getByTestId("seconds").textContent).toContain("59");
  });

  it("transitions to 'Campaign Ended' when deadline passes", () => {
    // Start 1 second before deadline
    const deadline = Math.floor(NOW_MS / 1_000) + 1;
    let now = NOW_MS;
    renderCountdown({ deadlineUnix: deadline, nowFn: () => now });

    expect(screen.queryByText("Campaign Ended")).toBeNull();

    act(() => {
      now += 2_000; // jump past deadline
      jest.advanceTimersByTime(TICK_MS);
    });

    expect(screen.getByText("Campaign Ended")).toBeInTheDocument();
  });

  it("clears interval on unmount (no memory leak)", () => {
    const clearSpy = jest.spyOn(global, "clearInterval");
    const { unmount } = renderCountdown();
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});

// ── MilestoneCountdown — security: text sanitisation ─────────────────────────

describe("MilestoneCountdown security", () => {
  it("sanitises control characters in milestone title", () => {
    const evil: Milestone = {
      thresholdBps: 5_000,
      title: "Hack\u0000Title",
      message: "Safe message",
    };
    renderCountdown({ progressBps: 5_000, milestones: [evil] });
    expect(screen.getByText("Hack Title")).toBeInTheDocument();
  });

  it("truncates oversized milestone title to MAX_TITLE_LENGTH", () => {
    const long: Milestone = {
      thresholdBps: 5_000,
      title: "T".repeat(200),
      message: "Safe message",
    };
    renderCountdown({ progressBps: 5_000, milestones: [long] });
    const titleEl = screen.getByText("T".repeat(MAX_TITLE_LENGTH));
    expect(titleEl).toBeInTheDocument();
  });

  it("truncates oversized milestone message to MAX_MESSAGE_LENGTH", () => {
    const long: Milestone = {
      thresholdBps: 5_000,
      title: "Title",
      message: "M".repeat(300),
    };
    renderCountdown({ progressBps: 5_000, milestones: [long] });
    const msgEl = screen.getByText("M".repeat(MAX_MESSAGE_LENGTH));
    expect(msgEl).toBeInTheDocument();
  });
});
