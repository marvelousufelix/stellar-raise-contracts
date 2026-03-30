import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import SuccessStories, {
  calculateProgress,
  clampNumber,
  formatCurrency,
  sanitizeStoryText,
  sanitizeUrl,
  type SuccessStory,
} from "./success_stories";

const stories: SuccessStory[] = [
  {
    id: "1",
    campaignName: "Solar Schools",
    creatorName: "Amina",
    raisedAmount: 120000,
    goalAmount: 100000,
    summary: "Installed solar kits in 12 schools.",
    backers: 500,
    completedAt: new Date("2026-02-15"),
    campaignUrl: "https://example.com/c/solar",
  },
  {
    id: "2",
    campaignName: "Water Wells",
    creatorName: "Khaled",
    raisedAmount: 40000,
    goalAmount: 80000,
    summary: "Built 3 new wells.",
    backers: 180,
    completedAt: new Date("2026-01-04"),
  },
];

describe("success_stories helpers", () => {
  it("sanitizeStoryText strips angle brackets and trims", () => {
    expect(sanitizeStoryText("  <b>Hello</b>  ")).toBe("bHello/b");
  });

  it("clampNumber enforces boundaries", () => {
    expect(clampNumber(-1, 0, 10)).toBe(0);
    expect(clampNumber(20, 0, 10)).toBe(10);
  });

  it("formatCurrency prints USD", () => {
    expect(formatCurrency(1000)).toContain("1,000");
  });

  it("calculateProgress handles zero goal", () => {
    expect(calculateProgress(50, 0)).toBe(0);
  });

  it("sanitizeUrl allows only http/https", () => {
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com/");
    expect(sanitizeUrl("javascript:alert(1)")).toBeUndefined();
  });
});

describe("SuccessStories component", () => {
  it("renders empty state", () => {
    render(<SuccessStories stories={[]} />);
    expect(screen.getByText(/No success stories yet/i)).toBeInTheDocument();
  });

  it("renders heading and stories", () => {
    render(<SuccessStories stories={stories} heading="Top wins" />);
    expect(screen.getByText("Top wins")).toBeInTheDocument();
    expect(screen.getByText("Solar Schools")).toBeInTheDocument();
    expect(screen.getByText("Water Wells")).toBeInTheDocument();
  });

  it("sorts stories by funding progress descending", () => {
    render(<SuccessStories stories={stories} />);
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings[0]).toHaveTextContent("Solar Schools");
  });

  it("fires selection callback", () => {
    const onSelect = jest.fn();
    render(<SuccessStories stories={stories} onStorySelect={onSelect} />);

    fireEvent.click(screen.getAllByRole("button", { name: /Read story/i })[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("does not render unsafe campaign link", () => {
    const unsafeStory: SuccessStory = {
      ...stories[0],
      campaignUrl: "javascript:alert(1)",
    };

    render(<SuccessStories stories={[unsafeStory]} />);
    expect(
      screen.queryByRole("link", { name: /Open campaign page/i }),
    ).not.toBeInTheDocument();
  });
});
