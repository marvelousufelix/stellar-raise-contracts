/**
 * @title MilestoneSounds — Comprehensive Test Suite
 * @notice Covers sound triggering, deduplication, mute toggle, visual indicator,
 *         accessibility, and edge cases.
 *
 * @dev Targets ≥ 95% coverage of milestone_sounds.tsx.
 *      Web Audio API is mocked to avoid browser-only APIs in test environment.
 */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import MilestoneSounds, {
  clampProgress,
  getMilestoneSoundConfig,
  resolveNextSoundMilestone,
  sanitizeString,
  type MilestoneSoundsProps,
  type SoundThreshold,
} from "./milestone_sounds";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock Web Audio API
const mockOscillatorStop = jest.fn();
const mockOscillatorStart = jest.fn();
const mockOscillatorConnect = jest.fn();
const mockGainConnect = jest.fn();
const mockCtxClose = jest.fn();

const mockAudioContext = jest.fn().mockImplementation(() => ({
  createOscillator: () => ({
    connect: mockOscillatorConnect,
    frequency: { setValueAtTime: jest.fn() },
    type: "sine",
    start: mockOscillatorStart,
    stop: mockOscillatorStop,
    onended: null,
  }),
  createGain: () => ({
    connect: mockGainConnect,
    gain: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
  }),
  destination: {},
  currentTime: 0,
  close: mockCtxClose,
}));

Object.defineProperty(window, "AudioContext", { value: mockAudioContext, writable: true });

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderMS(props: Partial<MilestoneSoundsProps> = {}) {
  return render(<MilestoneSounds currentPercent={0} {...props} />);
}

// ── clampProgress ─────────────────────────────────────────────────────────────

describe("clampProgress", () => {
  it("clamps below 0 to 0", () => expect(clampProgress(-10)).toBe(0));
  it("clamps above 100 to 100", () => expect(clampProgress(150)).toBe(100));
  it("passes through valid value", () => expect(clampProgress(50)).toBe(50));
  it("handles NaN", () => expect(clampProgress(NaN)).toBe(0));
  it("handles non-number", () => expect(clampProgress("abc" as unknown as number)).toBe(0));
});

// ── sanitizeString ────────────────────────────────────────────────────────────

describe("sanitizeString", () => {
  it("returns empty string for non-string input", () => expect(sanitizeString(123, 50)).toBe(""));
  it("strips control characters", () => expect(sanitizeString("hello\x00world", 50)).toBe("hello world"));
  it("truncates to maxLength", () => expect(sanitizeString("a".repeat(100), 10)).toBe("a".repeat(10)));
  it("collapses whitespace", () => expect(sanitizeString("a  b   c", 50)).toBe("a b c"));
});

// ── resolveNextSoundMilestone ─────────────────────────────────────────────────

describe("resolveNextSoundMilestone", () => {
  it("returns null when no milestone crossed", () => {
    expect(resolveNextSoundMilestone(10, new Set())).toBeNull();
  });

  it("returns first uncelebrated milestone", () => {
    expect(resolveNextSoundMilestone(50, new Set())).toBe(25);
  });

  it("skips already-played milestones", () => {
    const played = new Set<SoundThreshold>([25]);
    expect(resolveNextSoundMilestone(50, played)).toBe(50);
  });

  it("returns null when all milestones played", () => {
    const played = new Set<SoundThreshold>([25, 50, 75, 100]);
    expect(resolveNextSoundMilestone(100, played)).toBeNull();
  });
});

// ── getMilestoneSoundConfig ───────────────────────────────────────────────────

describe("getMilestoneSoundConfig", () => {
  it("returns chime for 25%", () => expect(getMilestoneSoundConfig(25).soundType).toBe("chime"));
  it("returns bell for 50%", () => expect(getMilestoneSoundConfig(50).soundType).toBe("bell"));
  it("returns fanfare for 75%", () => expect(getMilestoneSoundConfig(75).soundType).toBe("fanfare"));
  it("returns celebration for 100%", () => expect(getMilestoneSoundConfig(100).soundType).toBe("celebration"));
  it("returns label for each threshold", () => {
    expect(getMilestoneSoundConfig(25).label).toBe("25% Funded");
    expect(getMilestoneSoundConfig(100).label).toBe("Goal Reached");
  });
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe("MilestoneSounds — Rendering", () => {
  it("renders mute toggle button", () => {
    renderMS();
    expect(screen.getByTestId("mute-toggle")).toBeInTheDocument();
  });

  it("does not show indicator at 0%", () => {
    renderMS({ currentPercent: 0 });
    expect(screen.queryByTestId("sound-indicator")).not.toBeInTheDocument();
  });

  it("shows indicator when milestone crossed", () => {
    renderMS({ currentPercent: 25 });
    expect(screen.getByTestId("sound-indicator")).toBeInTheDocument();
  });

  it("shows correct label for 50% milestone", () => {
    renderMS({ currentPercent: 50 });
    expect(screen.getByTestId("sound-label")).toHaveTextContent("25% Funded");
  });

  it("shows campaign name when provided", () => {
    renderMS({ currentPercent: 25, campaignName: "My Campaign" });
    expect(screen.getByTestId("sound-campaign")).toHaveTextContent("My Campaign");
  });

  it("does not show campaign name when not provided", () => {
    renderMS({ currentPercent: 25 });
    expect(screen.queryByTestId("sound-campaign")).not.toBeInTheDocument();
  });
});

// ── Mute Toggle ───────────────────────────────────────────────────────────────

describe("MilestoneSounds — Mute Toggle", () => {
  it("starts unmuted by default", () => {
    renderMS();
    const btn = screen.getByTestId("mute-toggle");
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("starts muted when soundEnabled=false", () => {
    renderMS({ soundEnabled: false });
    const btn = screen.getByTestId("mute-toggle");
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles mute on click", () => {
    renderMS();
    const btn = screen.getByTestId("mute-toggle");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });
});

// ── Dismiss ───────────────────────────────────────────────────────────────────

describe("MilestoneSounds — Dismiss", () => {
  it("hides indicator on dismiss click", () => {
    renderMS({ currentPercent: 25 });
    fireEvent.click(screen.getByTestId("dismiss-button"));
    expect(screen.queryByTestId("sound-indicator")).not.toBeInTheDocument();
  });
});

// ── Callbacks ─────────────────────────────────────────────────────────────────

describe("MilestoneSounds — Callbacks", () => {
  it("calls onMilestoneSound when milestone crossed", () => {
    const onMilestoneSound = jest.fn();
    renderMS({ currentPercent: 25, onMilestoneSound });
    expect(onMilestoneSound).toHaveBeenCalledWith(25, "chime");
  });

  it("does not call callback when no milestone crossed", () => {
    const onMilestoneSound = jest.fn();
    renderMS({ currentPercent: 10, onMilestoneSound });
    expect(onMilestoneSound).not.toHaveBeenCalled();
  });

  it("deduplicates — does not re-trigger same milestone on rerender", () => {
    const onMilestoneSound = jest.fn();
    const { rerender } = renderMS({ currentPercent: 25, onMilestoneSound });
    rerender(<MilestoneSounds currentPercent={25} onMilestoneSound={onMilestoneSound} />);
    expect(onMilestoneSound).toHaveBeenCalledTimes(1);
  });

  it("triggers next milestone when progress increases", () => {
    const onMilestoneSound = jest.fn();
    const { rerender } = renderMS({ currentPercent: 25, onMilestoneSound });
    rerender(<MilestoneSounds currentPercent={50} onMilestoneSound={onMilestoneSound} />);
    expect(onMilestoneSound).toHaveBeenCalledTimes(2);
  });
});

// ── Auto-hide ─────────────────────────────────────────────────────────────────

describe("MilestoneSounds — Auto-hide", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("hides indicator after indicatorHideMs", () => {
    renderMS({ currentPercent: 25, indicatorHideMs: 1000 });
    expect(screen.getByTestId("sound-indicator")).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.queryByTestId("sound-indicator")).not.toBeInTheDocument();
  });

  it("does not auto-hide when indicatorHideMs=0", () => {
    renderMS({ currentPercent: 25, indicatorHideMs: 0 });
    act(() => jest.advanceTimersByTime(10_000));
    expect(screen.getByTestId("sound-indicator")).toBeInTheDocument();
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe("MilestoneSounds — Accessibility", () => {
  it("indicator has role=status", () => {
    renderMS({ currentPercent: 25 });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("indicator has aria-live=polite", () => {
    renderMS({ currentPercent: 25 });
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("mute button has aria-label", () => {
    renderMS();
    expect(screen.getByTestId("mute-toggle")).toHaveAttribute("aria-label");
  });

  it("dismiss button has aria-label", () => {
    renderMS({ currentPercent: 25 });
    expect(screen.getByTestId("dismiss-button")).toHaveAttribute("aria-label", "Dismiss sound indicator");
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────────────

describe("MilestoneSounds — Edge Cases", () => {
  it("handles 100% progress triggering all milestones sequentially", () => {
    const onMilestoneSound = jest.fn();
    renderMS({ currentPercent: 100, onMilestoneSound });
    // Only the first uncelebrated milestone (25) fires on initial render.
    expect(onMilestoneSound).toHaveBeenCalledTimes(1);
  });

  it("handles very large percentage", () => {
    renderMS({ currentPercent: 999999 });
    expect(screen.getByTestId("sound-indicator")).toBeInTheDocument();
  });

  it("handles negative percentage gracefully", () => {
    renderMS({ currentPercent: -50 });
    expect(screen.queryByTestId("sound-indicator")).not.toBeInTheDocument();
  });

  it("sanitizes long campaign name", () => {
    renderMS({ currentPercent: 25, campaignName: "A".repeat(200) });
    const el = screen.getByTestId("sound-campaign");
    expect(el.textContent!.length).toBeLessThanOrEqual(65); // " — " + 60 chars
  });
});
