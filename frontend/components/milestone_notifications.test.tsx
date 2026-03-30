import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MilestoneNotifications, {
  clampProgress,
  getUpcomingMilestones,
  sanitizeLabel,
  type MilestoneNotification,
  type MilestoneNotificationsProps,
} from "./milestone_notifications";

describe("MilestoneNotifications component", () => {
  const milestones: MilestoneNotification[] = [
    { id: "1", title: "25% goal", targetPercent: 25, reached: false },
    { id: "2", title: "50% goal", targetPercent: 50, reached: false },
    { id: "3", title: "100% goal", targetPercent: 100, reached: false },
  ];

  it("renders progress and campaign name", () => {
    render(
      <MilestoneNotifications
        campaignName="Campaign A"
        currentProgress={30}
        milestones={milestones}
      />
    );

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "30");
    expect(screen.getByText(/Campaign A/)).toBeInTheDocument();
  });

  it("shows no upcoming message when all are reached", () => {
    const reachedMilestones = milestones.map((m) => ({ ...m, reached: true }));
    render(
      <MilestoneNotifications
        campaignName="Campaign B"
        currentProgress={100}
        milestones={reachedMilestones}
      />
    );

    expect(screen.getByText(/No upcoming milestones/)).toBeInTheDocument();
  });

  it("calls onMilestoneClick when an upcoming milestone is clicked", () => {
    const onMilestoneClick = jest.fn();
    render(
      <MilestoneNotifications
        campaignName="Campaign C"
        currentProgress={20}
        milestones={milestones}
        onMilestoneClick={onMilestoneClick}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /25% goal at 25%/ }));
    expect(onMilestoneClick).toHaveBeenCalledWith("1");
  });
});

describe("clampProgress", () => {
  it("caps values above 100", () => {
    expect(clampProgress(200)).toBe(100);
  });

  it("floors values below 0", () => {
    expect(clampProgress(-1)).toBe(0);
  });

  it("returns 0 for NaN", () => {
    expect(clampProgress(NaN)).toBe(0);
  });
});

describe("sanitizeLabel", () => {
  it("removes tags", () => {
    expect(sanitizeLabel("Test <script>alert</script>")).toBe("Test scriptalert/script");
  });

  it("truncates long strings", () => {
    expect(sanitizeLabel("a".repeat(200))).toHaveLength(100);
  });
});

describe("getUpcomingMilestones", () => {
  const full = [
    { id: "1", title: "25%", targetPercent: 25, reached: false },
    { id: "2", title: "50%", targetPercent: 50, reached: false },
    { id: "3", title: "75%", targetPercent: 75, reached: true },
  ];

  it("returns first upcoming entries only", () => {
    const result = getUpcomingMilestones(full, 10);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("1");
  });

  it("skips reached milestones", () => {
    const result = getUpcomingMilestones(full, 70);
    expect(result).toHaveLength(0);
  });
});
