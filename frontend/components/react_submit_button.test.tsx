/**
 * @title   React Submit Button — Comprehensive Test Suite
 * @notice  Covers label safety, state transitions, interaction blocking,
 *          accessibility attributes, component rendering, and the new
 *          useReducer / useCallback / isMounted refactor paths.
 * @dev     Targets ≥ 95% coverage of react_submit_button.tsx.
 *          Run: npx jest frontend/components/react_submit_button.test.tsx
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ReactSubmitButton, {
  ALLOWED_TRANSITIONS,
  DEFAULT_LABELS,
  MAX_LABEL_LENGTH,
  isSubmitButtonBusy,
  isSubmitButtonDisabled,
  isSubmitButtonInteractionBlocked,
  isValidSubmitButtonStateTransition,
  normalizeSubmitButtonLabel,
  resolveSafeSubmitButtonState,
  resolveSubmitButtonLabel,
  resolveSafeSubmitButtonState,
  submitButtonReducer,
  type ReactSubmitButtonProps,
  type SubmitButtonLabels,
  type SubmitButtonState,
} from "./react_submit_button";

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderBtn(props: Partial<ReactSubmitButtonProps> = {}) {
  const { container } = render(<ReactSubmitButton state="idle" {...props} />);
  return container.querySelector("button") as HTMLButtonElement;
}

const ALL_STATES: SubmitButtonState[] = [
  "idle",
  "submitting",
  "success",
  "error",
  "disabled",
];

// ── submitButtonReducer ───────────────────────────────────────────────────────

describe("submitButtonReducer", () => {
  it("START_SUBMIT sets isLocallySubmitting to true", () => {
    const next = submitButtonReducer(
      { isLocallySubmitting: false },
      { type: "START_SUBMIT" },
    );
    expect(next.isLocallySubmitting).toBe(true);
  });

  it("END_SUBMIT sets isLocallySubmitting to false", () => {
    const next = submitButtonReducer(
      { isLocallySubmitting: true },
      { type: "END_SUBMIT" },
    );
    expect(next.isLocallySubmitting).toBe(false);
  });

  it("returns current state for unknown action", () => {
    const state = { isLocallySubmitting: true };
    // @ts-expect-error intentional unknown action for edge-case test
    expect(submitButtonReducer(state, { type: "UNKNOWN" })).toBe(state);
  });
});

// ── normalizeSubmitButtonLabel ────────────────────────────────────────────────

describe("normalizeSubmitButtonLabel", () => {
  it("returns fallback for non-string values", () => {
    expect(normalizeSubmitButtonLabel(undefined, "Submit")).toBe("Submit");
    expect(normalizeSubmitButtonLabel(null, "Submit")).toBe("Submit");
    expect(normalizeSubmitButtonLabel(404, "Submit")).toBe("Submit");
    expect(normalizeSubmitButtonLabel({}, "Submit")).toBe("Submit");
    expect(normalizeSubmitButtonLabel(true, "Submit")).toBe("Submit");
  });

  it("returns fallback for empty or whitespace-only strings", () => {
    expect(normalizeSubmitButtonLabel("", "Submit")).toBe("Submit");
    expect(normalizeSubmitButtonLabel("   ", "Submit")).toBe("Submit");
    expect(normalizeSubmitButtonLabel("\n\t", "Submit")).toBe("Submit");
  });

  it("strips control characters and normalizes whitespace", () => {
    expect(normalizeSubmitButtonLabel("Pay\u0000Now", "Submit")).toBe("Pay Now");
    expect(normalizeSubmitButtonLabel("Pay\u0008\u001FNow", "Submit")).toBe("Pay Now");
    expect(normalizeSubmitButtonLabel("Pay   \n   Now", "Submit")).toBe("Pay Now");
  });

  it("truncates labels above the maximum bound", () => {
    const longLabel = "A".repeat(200);
    const normalized = normalizeSubmitButtonLabel(longLabel, "Submit");
    expect(normalized).toHaveLength(80);
    expect(normalized.endsWith("...")).toBe(true);
  it("returns the label unchanged when within the 80-char limit", () => {
    const label = "A".repeat(MAX_LABEL_LENGTH);
    expect(normalizeSubmitButtonLabel(label, "Submit")).toBe(label);
  });

describe("resolveSubmitButtonLabel", () => {
  it("returns defaults for every known state", () => {
    const states: SubmitButtonState[] = ["idle", "submitting", "success", "error", "disabled"];
    const labels = states.map((state) => resolveSubmitButtonLabel(state));
    expect(labels).toEqual(["Submit", "Submitting...", "Submitted", "Try Again", "Submit Disabled"]);
  });

  it("uses sanitized custom labels", () => {
    const customLabels: SubmitButtonLabels = {
      success: "  Campaign submitted successfully  ",
    };
    expect(resolveSubmitButtonLabel("success", customLabels)).toBe("Campaign submitted successfully");
  it("truncates labels exceeding 80 characters with ellipsis", () => {
    const long = "A".repeat(200);
    const result = normalizeSubmitButtonLabel(long, "Submit");
    expect(result).toHaveLength(MAX_LABEL_LENGTH);
    expect(result.endsWith("...")).toBe(true);
  });

  it("preserves markup-like text as a plain string (XSS safe)", () => {
    const xss = "<img src=x onerror=alert(1) />";
    expect(normalizeSubmitButtonLabel(xss, "Submit")).toBe(xss);
  });

  it("handles a string of exactly MAX_LABEL_LENGTH + 1 chars", () => {
    const label = "B".repeat(MAX_LABEL_LENGTH + 1);
    const result = normalizeSubmitButtonLabel(label, "Submit");
    expect(result).toHaveLength(MAX_LABEL_LENGTH);
    expect(result.endsWith("...")).toBe(true);
  });
});

  it("uses custom labels when valid", () => {
// ── resolveSubmitButtonLabel ──────────────────────────────────────────────────

describe("resolveSubmitButtonLabel", () => {
  it("returns correct defaults for every state", () => {
    ALL_STATES.forEach((s) => {
      expect(resolveSubmitButtonLabel(s)).toBe(DEFAULT_LABELS[s]);
    });
  });

  it("uses valid custom labels", () => {
    const labels: SubmitButtonLabels = {
      idle: "Fund Campaign",
      submitting: "Funding...",
      success: "Funded!",
      error: "Retry",
      disabled: "Locked",
    };
    expect(resolveSubmitButtonLabel("idle", labels)).toBe("Send Now");
    expect(resolveSubmitButtonLabel("submitting", labels)).toBe("Please wait");
    expect(resolveSubmitButtonLabel("success", labels)).toBe("Done");
    expect(resolveSubmitButtonLabel("error", labels)).toBe("Retry");
    expect(resolveSubmitButtonLabel("disabled", labels)).toBe("Locked");
  });

  it("falls back to defaults for empty or whitespace labels", () => {
    ALL_STATES.forEach((s) => {
      expect(resolveSubmitButtonLabel(s, labels)).toBe(labels[s]);
    });
  });

  it("falls back to defaults for empty or whitespace custom labels", () => {
    const labels: SubmitButtonLabels = { idle: "", submitting: "   " };
    expect(resolveSubmitButtonLabel("idle", labels)).toBe("Submit");
    expect(resolveSubmitButtonLabel("submitting", labels)).toBe("Submitting...");
  });

  it("trims custom labels and limits overly long labels", () => {
    const veryLongLabel = `${"A".repeat(90)} trailing text`;
    const labels: SubmitButtonLabels = { success: `   ${veryLongLabel}   ` };
    const resolved = resolveSubmitButtonLabel("success", labels);
    expect(resolved.length).toBe(80);
    expect(resolved.endsWith("...")).toBe(true);
  });

  it("keeps potentially hostile text as plain label content", () => {
    const hostile = "<img src=x onerror=alert(1) />";
    const labels: SubmitButtonLabels = { error: hostile };
    expect(resolveSubmitButtonLabel("error", labels)).toBe(hostile);
  it("trims and truncates oversized custom labels", () => {
    const labels: SubmitButtonLabels = { success: `   ${"A".repeat(90)}   ` };
    const result = resolveSubmitButtonLabel("success", labels);
    expect(result).toHaveLength(MAX_LABEL_LENGTH);
    expect(result.endsWith("...")).toBe(true);
  });

  it("returns default when labels object is undefined", () => {
    expect(resolveSubmitButtonLabel("error", undefined)).toBe("Try Again");
  });
});

// ── isValidSubmitButtonStateTransition ───────────────────────────────────────

describe("isValidSubmitButtonStateTransition", () => {
  it("allows all transitions defined in ALLOWED_TRANSITIONS", () => {
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS) as [
      SubmitButtonState,
      SubmitButtonState[],
    ][]) {
      for (const to of targets) {
        expect(isValidSubmitButtonStateTransition(from, to)).toBe(true);
      }
    }
  });

  it("allows same-state transitions (idempotent)", () => {
    ALL_STATES.forEach((s) => {
      expect(isValidSubmitButtonStateTransition(s, s)).toBe(true);
    });
  });

  it("blocks transitions not in the allowed map", () => {
    expect(isValidSubmitButtonStateTransition("idle", "success")).toBe(false);
    expect(isValidSubmitButtonStateTransition("idle", "error")).toBe(false);
    expect(isValidSubmitButtonStateTransition("success", "error")).toBe(false);
    expect(isValidSubmitButtonStateTransition("success", "submitting")).toBe(false);
    expect(isValidSubmitButtonStateTransition("disabled", "submitting")).toBe(false);
    expect(isValidSubmitButtonStateTransition("disabled", "success")).toBe(false);
    expect(isValidSubmitButtonStateTransition("disabled", "error")).toBe(false);
  });
});

// ── resolveSafeSubmitButtonState ─────────────────────────────────────────────

describe("resolveSafeSubmitButtonState", () => {
  it("returns requested state when transition is valid (strict)", () => {
    expect(resolveSafeSubmitButtonState("submitting", "idle", true)).toBe("submitting");
    expect(resolveSafeSubmitButtonState("success", "submitting", true)).toBe("success");
    expect(resolveSafeSubmitButtonState("error", "submitting", true)).toBe("error");
    expect(resolveSafeSubmitButtonState("idle", "success", true)).toBe("idle");
    expect(resolveSafeSubmitButtonState("idle", "error", true)).toBe("idle");
  });

  it("falls back to previousState for invalid transitions in strict mode", () => {
    expect(resolveSafeSubmitButtonState("success", "idle", true)).toBe("idle");
    expect(resolveSafeSubmitButtonState("error", "success", true)).toBe("success");
    expect(resolveSafeSubmitButtonState("submitting", "disabled", true)).toBe("disabled");
  });

  it("accepts any state when strict mode is disabled", () => {
    expect(resolveSafeSubmitButtonState("success", "idle", false)).toBe("success");
    expect(resolveSafeSubmitButtonState("error", "success", false)).toBe("error");
  });

  it("accepts requested state when previousState is absent", () => {
    expect(resolveSafeSubmitButtonState("error", undefined, true)).toBe("error");
    expect(resolveSafeSubmitButtonState("success", undefined, true)).toBe("success");
  });

  it("defaults strictTransitions to true", () => {
    // idle → success is invalid; should fall back to idle
    expect(resolveSafeSubmitButtonState("success", "idle")).toBe("idle");
  });

  it("allows same-state in strict mode (idempotent)", () => {
    ALL_STATES.forEach((s) => {
      expect(resolveSafeSubmitButtonState(s, s, true)).toBe(s);
    });
  });
});

describe("isSubmitButtonInteractionBlocked", () => {
  it("blocks interaction for disabled and submitting states", () => {
// ── isSubmitButtonInteractionBlocked ─────────────────────────────────────────

describe("isSubmitButtonInteractionBlocked", () => {
  it("blocks interaction for submitting and disabled states", () => {
    expect(isSubmitButtonInteractionBlocked("submitting")).toBe(true);
    expect(isSubmitButtonInteractionBlocked("disabled")).toBe(true);
  });

  it("blocks when explicit disabled flag is set", () => {
    expect(isSubmitButtonInteractionBlocked("idle", true)).toBe(true);
    expect(isSubmitButtonInteractionBlocked("error", true)).toBe(true);
  });

  it("blocks when locally submitting", () => {
    expect(isSubmitButtonInteractionBlocked("idle", false, true)).toBe(true);
  });

  it("allows interaction for active states with no flags", () => {
    expect(isSubmitButtonInteractionBlocked("idle", false, false)).toBe(false);
    expect(isSubmitButtonInteractionBlocked("error", false, false)).toBe(false);
  });
});

describe("isSubmitButtonBusy", () => {
  it("sets busy only for submitting or local in-flight execution", () => {
    expect(isSubmitButtonBusy("submitting", false)).toBe(true);
    expect(isSubmitButtonBusy("idle", true)).toBe(true);
    expect(isSubmitButtonBusy("idle", false)).toBe(false);
  });

  it("is true only while submitting (no local flag)", () => {
    expect(isSubmitButtonBusy("submitting")).toBe(true);
    expect(isSubmitButtonBusy("idle")).toBe(false);
    expect(isSubmitButtonBusy("success")).toBe(false);
    expect(isSubmitButtonBusy("error")).toBe(false);
    expect(isSubmitButtonBusy("disabled")).toBe(false);
  });
});

describe("isSubmitButtonDisabled", () => {
  it("returns true for submitting and disabled states", () => {
    expect(isSubmitButtonDisabled("submitting")).toBe(true);
    expect(isSubmitButtonDisabled("disabled")).toBe(true);
  it("blocks interaction for success state", () => {
    expect(isSubmitButtonInteractionBlocked("success")).toBe(true);
  });

  it("blocks when both disabled flag and locally submitting are true", () => {
    expect(isSubmitButtonInteractionBlocked("idle", true, true)).toBe(true);
  });
});

// ── isSubmitButtonBusy ────────────────────────────────────────────────────────

describe("isSubmitButtonBusy", () => {
  it("is true only while submitting", () => {
    expect(isSubmitButtonBusy("submitting")).toBe(true);
  });

  it("is true when locally submitting regardless of state", () => {
    expect(isSubmitButtonBusy("idle", true)).toBe(true);
    expect(isSubmitButtonBusy("error", true)).toBe(true);
    expect(isSubmitButtonBusy("disabled", true)).toBe(true);
  });

  it("is false for all non-submitting states with no local flag", () => {
    const nonSubmitting: SubmitButtonState[] = ["idle", "success", "error", "disabled"];
    nonSubmitting.forEach((s) => {
      expect(isSubmitButtonBusy(s, false)).toBe(false);
    });
  });
});

// ── ReactSubmitButton — rendering ────────────────────────────────────────────

describe("ReactSubmitButton rendering", () => {
  it("renders a button element", () => {
    expect(renderBtn().tagName).toBe("BUTTON");
  });

  it("displays the resolved label as text content", () => {
    renderBtn({ state: "idle" });
    expect(screen.getByText("Submit")).toBeTruthy();
  });

  it("displays custom label override", () => {
    renderBtn({ state: "idle", labels: { idle: "Fund Campaign" } });
    expect(screen.getByText("Fund Campaign")).toBeTruthy();
  });

  it("sets data-state to the resolved state", () => {
    ALL_STATES.forEach((s) => {
      const btn = renderBtn({ state: s });
      expect(btn.getAttribute("data-state")).toBe(s);
    });
  });

  it("defaults type to 'button'", () => {
    expect(renderBtn().type).toBe("button");
  });

  it("respects explicit type prop", () => {
    expect(renderBtn({ type: "submit" }).type).toBe("submit");
    expect(renderBtn({ type: "reset" }).type).toBe("reset");
  });

  it("applies custom className", () => {
    expect(renderBtn({ className: "my-btn" }).className).toContain("my-btn");
  });

  it("sets the id attribute", () => {
    expect(renderBtn({ id: "contribute-btn" }).id).toBe("contribute-btn");
  });

  it("renders all five states without throwing", () => {
    ALL_STATES.forEach((s) => {
      expect(() => renderBtn({ state: s })).not.toThrow();
    });
  });
});

// ── ReactSubmitButton — disabled / blocked states ────────────────────────────

describe("ReactSubmitButton disabled behavior", () => {
  it("is disabled in submitting state", () => {
    expect(renderBtn({ state: "submitting" }).disabled).toBe(true);
  });

  it("is disabled in disabled state", () => {
    expect(renderBtn({ state: "disabled" }).disabled).toBe(true);
  });

  it("is disabled when disabled prop is true", () => {
    expect(renderBtn({ disabled: true }).disabled).toBe(true);
  });

  it("is NOT disabled in idle or error states by default", () => {
    expect(renderBtn({ state: "idle" }).disabled).toBe(false);
    expect(renderBtn({ state: "error" }).disabled).toBe(false);
  });

  it("is disabled in success state (prevents re-submission)", () => {
    expect(renderBtn({ state: "success" }).disabled).toBe(true);
  });
});

// ── ReactSubmitButton — accessibility ────────────────────────────────────────

describe("ReactSubmitButton accessibility", () => {
  it("has aria-live='polite'", () => {
    expect(renderBtn().getAttribute("aria-live")).toBe("polite");
  });

  it("sets aria-busy='true' while submitting", () => {
    expect(renderBtn({ state: "submitting" }).getAttribute("aria-busy")).toBe("true");
  });

  it("sets aria-busy='false' for non-submitting states", () => {
    const nonBusy: SubmitButtonState[] = ["idle", "success", "error", "disabled"];
    nonBusy.forEach((s) => {
      expect(renderBtn({ state: s }).getAttribute("aria-busy")).toBe("false");
    });
  });

  it("sets aria-label to the resolved label", () => {
    expect(renderBtn({ state: "idle" }).getAttribute("aria-label")).toBe("Submit");
    expect(renderBtn({ state: "error" }).getAttribute("aria-label")).toBe("Try Again");
    expect(renderBtn({ state: "submitting" }).getAttribute("aria-label")).toBe("Submitting...");
  });
});

// ── ReactSubmitButton — click handling ───────────────────────────────────────

describe("ReactSubmitButton click handling", () => {
  it("fires onClick in idle state", async () => {
    const onClick = jest.fn().mockResolvedValue(undefined);
    const { container } = render(<ReactSubmitButton state="idle" onClick={onClick} />);
    const btn = container.querySelector("button") as HTMLButtonElement;
    await act(async () => { fireEvent.click(btn); });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fires onClick in error state (retry)", async () => {
    const onClick = jest.fn().mockResolvedValue(undefined);
    const { container } = render(<ReactSubmitButton state="error" onClick={onClick} />);
    const btn = container.querySelector("button") as HTMLButtonElement;
    await act(async () => { fireEvent.click(btn); });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onClick in submitting state", () => {
    const onClick = jest.fn();
    const { container } = render(<ReactSubmitButton state="submitting" onClick={onClick} />);
    fireEvent.click(container.querySelector("button") as HTMLButtonElement);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does NOT fire onClick in disabled state", () => {
    const onClick = jest.fn();
    const { container } = render(<ReactSubmitButton state="disabled" onClick={onClick} />);
    fireEvent.click(container.querySelector("button") as HTMLButtonElement);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does NOT fire onClick when disabled prop is true", () => {
    const onClick = jest.fn();
    const { container } = render(
      <ReactSubmitButton state="idle" disabled={true} onClick={onClick} />,
    );
    fireEvent.click(container.querySelector("button") as HTMLButtonElement);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does NOT fire onClick in success state", () => {
    const onClick = jest.fn();
    const { container } = render(<ReactSubmitButton state="success" onClick={onClick} />);
    fireEvent.click(container.querySelector("button") as HTMLButtonElement);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("handles async onClick without throwing", async () => {
    const onClick = jest.fn().mockResolvedValue(undefined);
    const { container } = render(<ReactSubmitButton state="idle" onClick={onClick} />);
    await act(async () => {
      fireEvent.click(container.querySelector("button") as HTMLButtonElement);
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not propagate errors from a rejected async onClick", async () => {
    const onClick = jest.fn().mockRejectedValue(new Error("tx failed"));
    const { container } = render(<ReactSubmitButton state="idle" onClick={onClick} />);
    await act(async () => {
      fireEvent.click(container.querySelector("button") as HTMLButtonElement);
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("handles click gracefully when no onClick is provided", async () => {
    const btn = renderBtn({ state: "idle" });
    await act(async () => { fireEvent.click(btn); });
    expect(btn).toBeTruthy();
  });

  it("prevents double-submit on rapid successive clicks", async () => {
    let resolveFirst!: () => void;
    const slowClick = jest.fn(
      () => new Promise<void>((res) => { resolveFirst = res; }),
    );
    const { container } = render(<ReactSubmitButton state="idle" onClick={slowClick} />);
    const btn = container.querySelector("button") as HTMLButtonElement;
    // First click starts the in-flight handler
    fireEvent.click(btn);
    // Second click while first is still in-flight — should be ignored
    fireEvent.click(btn);
    await act(async () => { resolveFirst(); });
    expect(slowClick).toHaveBeenCalledTimes(1);
  });
});

// ── ReactSubmitButton — strict transition enforcement ────────────────────────

describe("ReactSubmitButton strict transitions", () => {
  it("renders previousState when transition is invalid in strict mode", () => {
    const btn = renderBtn({
      state: "success",
      previousState: "idle",
      strictTransitions: true,
    });
    expect(btn.getAttribute("data-state")).toBe("idle");
  });

  it("renders requested state when transition is valid in strict mode", () => {
    const btn = renderBtn({
      state: "submitting",
      previousState: "idle",
      strictTransitions: true,
    });
    expect(btn.getAttribute("data-state")).toBe("submitting");
  });

  it("renders requested state when strict mode is disabled", () => {
    const btn = renderBtn({
      state: "success",
      previousState: "idle",
      strictTransitions: false,
    });
    expect(btn.getAttribute("data-state")).toBe("success");
  });

  it("renders requested state when no previousState is given", () => {
    const btn = renderBtn({ state: "error", strictTransitions: true });
    expect(btn.getAttribute("data-state")).toBe("error");
  });
});

// ── ReactSubmitButton — isMounted guard (unmount during async onClick) ────────

describe("ReactSubmitButton isMounted guard", () => {
  it("does not dispatch after unmount during async onClick", async () => {
    let resolveClick!: () => void;
    const slowClick = jest.fn(
      () => new Promise<void>((res) => { resolveClick = res; }),
    );
    const { container, unmount } = render(
      <ReactSubmitButton state="idle" onClick={slowClick} />,
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    fireEvent.click(btn);
    // Unmount before the async handler resolves
    unmount();
    // Resolving after unmount should not throw or warn
    await act(async () => { resolveClick(); });
    expect(slowClick).toHaveBeenCalledTimes(1);
  });
});
