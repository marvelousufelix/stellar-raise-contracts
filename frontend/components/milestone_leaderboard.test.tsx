/**
 * @title MilestoneLeaderboard — Comprehensive Test Suite
 * @notice Covers rendering, address privacy, sorting, maxVisible, medal
 *         styling, click callbacks, empty state, and accessibility.
 *
 * @dev Targets >= 95% coverage of milestone_leaderboard.tsx.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MilestoneLeaderboard, {
  type MilestoneLeaderboardProps,
  type LeaderboardEntry,
} from "./milestone_leaderboard";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTRIES: LeaderboardEntry[] = [
  { rank: 1, address: "GABC1234WXYZ5678", contribution: 500, displayName: "Alice" },
  { rank: 2, address: "GDEF1234WXYZ9012", contribution: 300 },
  { rank: 3, address: "GHIJ1234WXYZ3456", contribution: 200 },
  { rank: 4, address: "GKLM1234WXYZ7890", contribution: 100 },
];

function renderML(props: Partial<MilestoneLeaderboardProps> = {}) {
  return render(
    <MilestoneLeaderboard
      entries={ENTRIES}
      goal={1000}
      currentPercent={100}
      {...props}
    />,
  );
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe("MilestoneLeaderboard — Rendering", () => {
  it("renders the leaderboard region", () => {
    renderML();
    expect(
      screen.getByRole("region", { name: /Milestone Leaderboard/i }),
    ).toBeInTheDocument();
  });

  it("renders all entries by default", () => {
    renderML();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("shows displayName when available", () => {
    renderML();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows contribution amounts", () => {
    renderML();
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByText("300")).toBeInTheDocument();
  });
});

// ── Address Privacy ───────────────────────────────────────────────────────────

describe("MilestoneLeaderboard — Address Privacy", () => {
  it("truncates address when showAddresses=false (default)", () => {
    renderML();
    // GDEF1234WXYZ9012 → GDEF...9012
    expect(screen.getByText("GDEF...9012")).toBeInTheDocument();
  });

  it("shows full address when showAddresses=true", () => {
    renderML({ showAddresses: true });
    expect(screen.getByText("GDEF1234WXYZ9012")).toBeInTheDocument();
  });

  it("prefers displayName over address regardless of showAddresses", () => {
    renderML({ showAddresses: false });
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("GABC...5678")).not.toBeInTheDocument();
  });
});

// ── Sorting ───────────────────────────────────────────────────────────────────

describe("MilestoneLeaderboard — Sorting", () => {
  it("sorts entries by contribution descending", () => {
    const unsorted: LeaderboardEntry[] = [
      { rank: 3, address: "ADDR00000000CCCC", contribution: 200 },
      { rank: 1, address: "ADDR00000000AAAA", contribution: 500 },
      { rank: 2, address: "ADDR00000000BBBB", contribution: 300 },
    ];
    render(
      <MilestoneLeaderboard
        entries={unsorted}
        goal={1000}
        currentPercent={100}
        showAddresses
      />,
    );
    const items = screen.getAllByRole("listitem");
    // First item should show 500
    expect(items[0]).toHaveTextContent("500");
    expect(items[1]).toHaveTextContent("300");
    expect(items[2]).toHaveTextContent("200");
  });

  it("does not mutate the original entries array", () => {
    const original = [...ENTRIES];
    renderML();
    expect(ENTRIES).toEqual(original);
  });
});

// ── maxVisible ────────────────────────────────────────────────────────────────

describe("MilestoneLeaderboard — maxVisible", () => {
  it("limits displayed entries to maxVisible", () => {
    renderML({ maxVisible: 2 });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows all entries when maxVisible >= entries.length", () => {
    renderML({ maxVisible: 10 });
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });
});

// ── Medal Styling ─────────────────────────────────────────────────────────────

describe("MilestoneLeaderboard — Medal Styling", () => {
  it("first entry has gold class", () => {
    renderML();
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveClass("gold");
  });

  it("second entry has silver class", () => {
    renderML();
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveClass("silver");
  });

  it("third entry has bronze class", () => {
    renderML();
    const items = screen.getAllByRole("listitem");
    expect(items[2]).toHaveClass("bronze");
  });

  it("fourth entry has no medal class", () => {
    renderML();
    const items = screen.getAllByRole("listitem");
    expect(items[3]).not.toHaveClass("gold");
    expect(items[3]).not.toHaveClass("silver");
    expect(items[3]).not.toHaveClass("bronze");
  });
});

// ── onEntryClick ──────────────────────────────────────────────────────────────

describe("MilestoneLeaderboard — onEntryClick", () => {
  it("calls onEntryClick with the correct entry when clicked", () => {
    const onEntryClick = jest.fn();
    renderML({ onEntryClick });
    const items = screen.getAllByRole("listitem");
    fireEvent.click(items[0]);
    // First sorted entry is Alice (contribution 500)
    expect(onEntryClick).toHaveBeenCalledWith(
      expect.objectContaining({ contribution: 500, displayName: "Alice" }),
    );
  });

  it("does not throw when onEntryClick is not provided", () => {
    renderML();
    const items = screen.getAllByRole("listitem");
    expect(() => fireEvent.click(items[0])).not.toThrow();
  });
});

// ── Empty State ───────────────────────────────────────────────────────────────

describe("MilestoneLeaderboard — Empty State", () => {
  it("renders without error when entries is empty", () => {
    expect(() =>
      render(
        <MilestoneLeaderboard entries={[]} goal={1000} currentPercent={0} />,
      ),
    ).not.toThrow();
  });

  it("renders no list items when entries is empty", () => {
    render(
      <MilestoneLeaderboard entries={[]} goal={1000} currentPercent={0} />,
    );
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe("MilestoneLeaderboard — Accessibility", () => {
  it("has region role with aria-label", () => {
    renderML();
    expect(
      screen.getByRole("region", { name: "Milestone Leaderboard" }),
    ).toBeInTheDocument();
  });

  it("has list role", () => {
    renderML();
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("progress bars have aria attributes", () => {
    renderML();
    const bars = screen.getAllByRole("progressbar");
    expect(bars.length).toBeGreaterThan(0);
    bars.forEach((bar) => {
      expect(bar).toHaveAttribute("aria-valuenow");
      expect(bar).toHaveAttribute("aria-valuemin", "0");
      expect(bar).toHaveAttribute("aria-valuemax", "100");
    });
  });
});
