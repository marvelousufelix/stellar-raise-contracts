/**
 * @title MilestoneEmail — Comprehensive Test Suite
 * @notice Covers rendering, personalization, CTA behaviour, percent clamping,
 *         and accessibility for milestone_emails.tsx.
 *
 * @dev Targets >= 95% coverage of milestone_emails.tsx.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MilestoneEmail, { type MilestoneEmailProps } from "./milestone_emails";

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderME(props: Partial<MilestoneEmailProps> = {}) {
  return render(
    <MilestoneEmail
      campaignTitle="Test Campaign"
      creatorName="Alice"
      currentPercent={50}
      totalRaised={500}
      goal={1000}
      milestoneLabel="Half Way"
      {...props}
    />,
  );
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe("MilestoneEmail — Rendering", () => {
  it("shows campaign title", () => {
    renderME();
    expect(screen.getAllByText(/Test Campaign/i).length).toBeGreaterThan(0);
  });

  it("shows milestone label", () => {
    renderME();
    expect(screen.getByText("Half Way")).toBeInTheDocument();
  });

  it("shows total raised", () => {
    renderME();
    expect(screen.getByText(/Raised: 500/i)).toBeInTheDocument();
  });

  it("shows goal", () => {
    renderME();
    expect(screen.getByText(/Goal: 1000/i)).toBeInTheDocument();
  });

  it("shows creator name", () => {
    renderME();
    expect(screen.getByText(/Campaign by Alice/i)).toBeInTheDocument();
  });

  it("shows funding percentage in message", () => {
    renderME({ currentPercent: 75 });
    expect(screen.getByText(/75%/i)).toBeInTheDocument();
  });
});

// ── Personalization ───────────────────────────────────────────────────────────

describe("MilestoneEmail — Personalization", () => {
  it("shows personalized greeting when recipientName provided", () => {
    renderME({ recipientName: "Bob" });
    expect(screen.getByText("Hi Bob,")).toBeInTheDocument();
  });

  it("shows generic greeting when recipientName not provided", () => {
    renderME();
    expect(screen.getByText("Hi there,")).toBeInTheDocument();
  });
});

// ── CTA / onSend ──────────────────────────────────────────────────────────────

describe("MilestoneEmail — CTA / onSend", () => {
  it("calls onSend with recipientName when button clicked", () => {
    const onSend = jest.fn();
    renderME({ recipientName: "Carol", onSend });
    fireEvent.click(screen.getByRole("button"));
    expect(onSend).toHaveBeenCalledWith("Carol");
  });

  it("calls onSend with 'contributor' when no recipientName", () => {
    const onSend = jest.fn();
    renderME({ onSend });
    fireEvent.click(screen.getByRole("button"));
    expect(onSend).toHaveBeenCalledWith("contributor");
  });

  it("does not throw when onSend is not provided", () => {
    renderME();
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
  });
});

// ── Percent Clamping ──────────────────────────────────────────────────────────

describe("MilestoneEmail — Percent Clamping", () => {
  it("clamps percent > 100 to 100", () => {
    renderME({ currentPercent: 150 });
    expect(screen.getByText(/100%/i)).toBeInTheDocument();
  });

  it("clamps negative percent to 0", () => {
    renderME({ currentPercent: -10 });
    expect(screen.getByText(/0%/i)).toBeInTheDocument();
  });

  it("renders 0% correctly", () => {
    renderME({ currentPercent: 0 });
    expect(screen.getByText(/0%/i)).toBeInTheDocument();
  });

  it("renders 100% correctly", () => {
    renderME({ currentPercent: 100 });
    expect(screen.getByText(/100%/i)).toBeInTheDocument();
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe("MilestoneEmail — Accessibility", () => {
  it("has a region role", () => {
    renderME();
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("region has aria-label", () => {
    renderME();
    expect(
      screen.getByRole("region", {
        name: /Milestone Celebration Email Preview/i,
      }),
    ).toBeInTheDocument();
  });

  it("button has accessible aria-label", () => {
    renderME({ recipientName: "Dave" });
    expect(
      screen.getByRole("button", {
        name: /Send milestone celebration email to Dave/i,
      }),
    ).toBeInTheDocument();
  });

  it("button has accessible aria-label without recipientName", () => {
    renderME();
    expect(
      screen.getByRole("button", {
        name: /Send milestone celebration email to contributor/i,
      }),
    ).toBeInTheDocument();
  });
});
