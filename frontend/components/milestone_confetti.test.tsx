import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import {
  MilestoneConfetti,
  clampConfettiProgress,
  sanitizeConfettiName,
  getReachedMilestone,
  CONFETTI_MILESTONES,
  DEFAULT_CONFETTI_DISMISS_MS,
  MAX_CONFETTI_NAME_LENGTH,
  MILESTONE_COLORS,
} from "./milestone_confetti";

// ── Canvas mock ───────────────────────────────────────────────────────────────

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    clearRect: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    rotate: jest.fn(),
    fillRect: jest.fn(),
    set globalAlpha(_: number) {},
    set fillStyle(_: string) {},
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

// ── clampConfettiProgress ─────────────────────────────────────────────────────

describe("clampConfettiProgress", () => {
  it("returns value unchanged within [0, 100]", () => {
    expect(clampConfettiProgress(0)).toBe(0);
    expect(clampConfettiProgress(50)).toBe(50);
    expect(clampConfettiProgress(100)).toBe(100);
  });

  it("clamps values below 0 to 0", () => {
    expect(clampConfettiProgress(-1)).toBe(0);
    expect(clampConfettiProgress(-999)).toBe(0);
  });

  it("clamps values above 100 to 100", () => {
    expect(clampConfettiProgress(101)).toBe(100);
    expect(clampConfettiProgress(9999)).toBe(100);
  });

  it("returns 0 for NaN", () => {
    expect(clampConfettiProgress(NaN)).toBe(0);
  });

  it("returns 0 for non-numeric input coerced as number", () => {
    expect(clampConfettiProgress("abc" as unknown as number)).toBe(0);
  });
});

// ── sanitizeConfettiName ──────────────────────────────────────────────────────

describe("sanitizeConfettiName", () => {
  it("returns empty string for non-string input", () => {
    expect(sanitizeConfettiName(null)).toBe("");
    expect(sanitizeConfettiName(42)).toBe("");
    expect(sanitizeConfettiName(undefined)).toBe("");
  });

  it("strips control characters", () => {
    expect(sanitizeConfettiName("hello\u0000world")).toBe("helloworld");
    expect(sanitizeConfettiName("test\u001Fvalue")).toBe("testvalue");
    expect(sanitizeConfettiName("abc\u007Fdef")).toBe("abcdef");
  });

  it("collapses whitespace", () => {
    expect(sanitizeConfettiName("  hello   world  ")).toBe("hello world");
  });

  it("truncates to MAX_CONFETTI_NAME_LENGTH by default", () => {
    const long = "a".repeat(MAX_CONFETTI_NAME_LENGTH + 10);
    expect(sanitizeConfettiName(long)).toHaveLength(MAX_CONFETTI_NAME_LENGTH);
  });

  it("respects custom maxLength", () => {
    expect(sanitizeConfettiName("hello world", 5)).toBe("hello");
  });

  it("returns valid string unchanged", () => {
    expect(sanitizeConfettiName("My Campaign")).toBe("My Campaign");
  });
});

// ── getReachedMilestone ───────────────────────────────────────────────────────

describe("getReachedMilestone", () => {
  it("returns null when progress is below first milestone", () => {
    expect(getReachedMilestone(0)).toBeNull();
    expect(getReachedMilestone(24)).toBeNull();
  });

  it("returns the highest reached milestone", () => {
    expect(getReachedMilestone(25)).toBe(25);
    expect(getReachedMilestone(50)).toBe(50);
    expect(getReachedMilestone(75)).toBe(75);
    expect(getReachedMilestone(100)).toBe(100);
  });

  it("returns the highest milestone for values between thresholds", () => {
    expect(getReachedMilestone(30)).toBe(25);
    expect(getReachedMilestone(60)).toBe(50);
    expect(getReachedMilestone(80)).toBe(75);
  });
});

// ── MILESTONE_COLORS ──────────────────────────────────────────────────────────

describe("MILESTONE_COLORS", () => {
  it("has an entry for every milestone", () => {
    for (const m of CONFETTI_MILESTONES) {
      expect(MILESTONE_COLORS[m]).toBeDefined();
      expect(MILESTONE_COLORS[m].length).toBeGreaterThan(0);
    }
  });

  it("contains only valid CSS hex colors", () => {
    const hexColor = /^#[0-9a-fA-F]{3,8}$/;
    for (const colors of Object.values(MILESTONE_COLORS)) {
      for (const c of colors) {
        expect(c).toMatch(hexColor);
      }
    }
  });
});

// ── MilestoneConfetti component ───────────────────────────────────────────────

describe("MilestoneConfetti", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("renders nothing when progress is below first milestone", () => {
    const { container } = render(<MilestoneConfetti progress={10} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the overlay when progress reaches 25%", () => {
    render(<MilestoneConfetti progress={25} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows the correct milestone percentage in the banner", () => {
    render(<MilestoneConfetti progress={50} />);
    expect(screen.getByText(/50% funded/i)).toBeInTheDocument();
  });

  it("includes the campaign name in the banner when provided", () => {
    render(<MilestoneConfetti progress={75} campaignName="Solar Farm" />);
    expect(screen.getByText(/Solar Farm/i)).toBeInTheDocument();
  });

  it("sanitizes a malicious campaign name", () => {
    const { container } = render(
      <MilestoneConfetti
        progress={100}
        campaignName={"<script>alert(1)</script>"}
      />
    );
    // React escapes the string — no live <script> element should be injected
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("dismisses when the Dismiss button is clicked", () => {
    const onDismiss = jest.fn();
    render(<MilestoneConfetti progress={25} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("auto-dismisses after dismissMs", () => {
    const onDismiss = jest.fn();
    render(
      <MilestoneConfetti
        progress={25}
        dismissMs={DEFAULT_CONFETTI_DISMISS_MS}
        onDismiss={onDismiss}
      />
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(DEFAULT_CONFETTI_DISMISS_MS + 100);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not auto-dismiss when dismissMs is 0", () => {
    render(<MilestoneConfetti progress={25} dismissMs={0} />);
    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("calls onMilestone with the reached milestone", () => {
    const onMilestone = jest.fn();
    render(<MilestoneConfetti progress={50} onMilestone={onMilestone} />);
    expect(onMilestone).toHaveBeenCalledWith(50);
  });

  it("fires onMilestone only once per milestone", () => {
    const onMilestone = jest.fn();
    const { rerender } = render(
      <MilestoneConfetti progress={25} onMilestone={onMilestone} />
    );
    rerender(<MilestoneConfetti progress={26} onMilestone={onMilestone} />);
    rerender(<MilestoneConfetti progress={27} onMilestone={onMilestone} />);
    expect(onMilestone).toHaveBeenCalledTimes(1);
  });

  it("fires onMilestone for each new milestone crossed", () => {
    const onMilestone = jest.fn();
    const { rerender } = render(
      <MilestoneConfetti progress={25} onMilestone={onMilestone} />
    );
    // Dismiss first overlay so the next milestone can show
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    rerender(<MilestoneConfetti progress={50} onMilestone={onMilestone} />);
    expect(onMilestone).toHaveBeenCalledTimes(2);
    expect(onMilestone).toHaveBeenNthCalledWith(1, 25);
    expect(onMilestone).toHaveBeenNthCalledWith(2, 50);
  });

  it("clamps out-of-range progress values", () => {
    // progress > 100 should trigger 100% milestone
    const onMilestone = jest.fn();
    render(<MilestoneConfetti progress={200} onMilestone={onMilestone} />);
    expect(onMilestone).toHaveBeenCalledWith(100);
  });

  it("renders a canvas element that is aria-hidden", () => {
    render(<MilestoneConfetti progress={25} />);
    const canvas = document.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute("aria-hidden", "true");
  });

  it("dismiss button has accessible aria-label", () => {
    render(<MilestoneConfetti progress={25} />);
    expect(
      screen.getByRole("button", { name: /dismiss celebration/i })
    ).toBeInTheDocument();
  });
});
