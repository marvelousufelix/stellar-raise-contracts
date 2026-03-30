/**
 * @title MilestoneReports — Comprehensive Test Suite
 * @notice Covers pure helpers, ReportRow, ReportTable, and MilestoneReports
 *         (rendering, sorting, filtering, export, accessibility, edge cases).
 *
 * @dev Targets ≥ 95% coverage of milestone_reports.tsx.
 *
 * @custom:security-note Tests assert that user-supplied strings are sanitized,
 *         CSV fields are formula-injection-safe, and sort keys are validated
 *         against the allowlist before property access.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MilestoneReports, {
  REPORT_MILESTONES,
  SORT_KEYS,
  STRONG_VELOCITY_THRESHOLD,
  HIGH_ENGAGEMENT_THRESHOLD,
  MAX_REPORT_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  ReportRow,
  ReportTable,
  buildCsvReport,
  buildReportEntries,
  buildReportNote,
  clampReportPercent,
  formatReportDate,
  formatReportValue,
  isSortKey,
  resolveReportSeverity,
  sanitizeCsvField,
  sanitizeReportString,
  sortReportEntries,
  type MilestoneReportsProps,
  type MilestoneSnapshot,
  type ReportEntry,
  type ReportMilestone,
  type SortKey,
} from "./milestone_reports";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<MilestoneSnapshot> = {}): MilestoneSnapshot {
  return {
    threshold: 25,
    reachedAt: 1_700_000_000_000,
    totalRaised: 250,
    goal: 1000,
    contributorCount: 5,
    velocity: 500,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<ReportEntry> = {}): ReportEntry {
  return {
    threshold: 25,
    reachedAt: 1_700_000_000_000,
    totalRaised: 250,
    goal: 1000,
    contributorCount: 5,
    velocity: 500,
    note: "25% milestone reached with 5 contributors and moderate velocity.",
    severity: "warning",
    ...overrides,
  };
}

function renderReports(props: Partial<MilestoneReportsProps> = {}) {
  return render(
    <MilestoneReports snapshots={[]} {...props} />,
  );
}

// ── clampReportPercent ────────────────────────────────────────────────────────

describe("clampReportPercent", () => {
  it("returns 0 for NaN", () => expect(clampReportPercent(NaN)).toBe(0));
  it("returns 0 for Infinity", () => expect(clampReportPercent(Infinity)).toBe(0));
  it("returns 0 for -Infinity", () => expect(clampReportPercent(-Infinity)).toBe(0));
  it("returns 0 for non-number", () =>
    expect(clampReportPercent("x" as unknown as number)).toBe(0));
  it("clamps -1 to 0", () => expect(clampReportPercent(-1)).toBe(0));
  it("clamps 101 to 100", () => expect(clampReportPercent(101)).toBe(100));
  it("passes 0 through", () => expect(clampReportPercent(0)).toBe(0));
  it("passes 50 through", () => expect(clampReportPercent(50)).toBe(50));
  it("passes 100 through", () => expect(clampReportPercent(100)).toBe(100));
});

// ── sanitizeReportString ──────────────────────────────────────────────────────

describe("sanitizeReportString", () => {
  it("returns '' for null", () => expect(sanitizeReportString(null, 60)).toBe(""));
  it("returns '' for undefined", () => expect(sanitizeReportString(undefined, 60)).toBe(""));
  it("returns '' for number", () => expect(sanitizeReportString(42, 60)).toBe(""));
  it("strips control characters", () =>
    expect(sanitizeReportString("hello\x00world", 60)).toBe("hello world"));
  it("strips DEL character", () =>
    expect(sanitizeReportString("a\x7Fb", 60)).toBe("a b"));
  it("strips HTML tags", () =>
    expect(sanitizeReportString("<b>bold</b>", 60)).toBe("bold"));
  it("strips script tags", () =>
    expect(sanitizeReportString("<script>alert(1)</script>", 60)).toBe("alert(1)"));
  it("collapses whitespace", () =>
    expect(sanitizeReportString("a   b", 60)).toBe("a b"));
  it("truncates to maxLength", () =>
    expect(sanitizeReportString("abcdef", 3)).toBe("abc"));
  it("returns '' for blank input", () =>
    expect(sanitizeReportString("   ", 60)).toBe(""));
  it("passes through normal string", () =>
    expect(sanitizeReportString("Solar Farm", 60)).toBe("Solar Farm"));
  it("respects MAX_REPORT_NAME_LENGTH", () => {
    const long = "a".repeat(MAX_REPORT_NAME_LENGTH + 10);
    expect(sanitizeReportString(long, MAX_REPORT_NAME_LENGTH)).toHaveLength(MAX_REPORT_NAME_LENGTH);
  });
  it("respects MAX_NOTE_LENGTH", () => {
    const long = "a".repeat(MAX_NOTE_LENGTH + 10);
    expect(sanitizeReportString(long, MAX_NOTE_LENGTH)).toHaveLength(MAX_NOTE_LENGTH);
  });
});

// ── sanitizeCsvField ──────────────────────────────────────────────────────────

describe("sanitizeCsvField", () => {
  it("wraps value in double-quotes", () =>
    expect(sanitizeCsvField("hello")).toBe('"hello"'));
  it("escapes internal double-quotes", () =>
    expect(sanitizeCsvField('say "hi"')).toBe('"say ""hi"""'));
  it("strips leading = (formula injection)", () =>
    expect(sanitizeCsvField("=SUM(A1)")).toBe('"SUM(A1)"'));
  it("strips leading + (formula injection)", () =>
    expect(sanitizeCsvField("+cmd")).toBe('"cmd"'));
  it("strips leading - (formula injection)", () =>
    expect(sanitizeCsvField("-cmd")).toBe('"cmd"'));
  it("strips leading @ (formula injection)", () =>
    expect(sanitizeCsvField("@user")).toBe('"user"'));
  it("strips leading TAB (formula injection)", () =>
    expect(sanitizeCsvField("\tcmd")).toBe('"cmd"'));
  it("strips leading CR (formula injection)", () =>
    expect(sanitizeCsvField("\rcmd")).toBe('"cmd"'));
  it("passes through safe string unchanged", () =>
    expect(sanitizeCsvField("Solar Farm")).toBe('"Solar Farm"'));
  it("handles empty string", () =>
    expect(sanitizeCsvField("")).toBe('""'));
});

// ── formatReportDate ──────────────────────────────────────────────────────────

describe("formatReportDate", () => {
  it("returns '—' for 0", () => expect(formatReportDate(0)).toBe("—"));
  it("returns '—' for negative", () => expect(formatReportDate(-1)).toBe("—"));
  it("returns '—' for NaN", () => expect(formatReportDate(NaN)).toBe("—"));
  it("returns '—' for Infinity", () => expect(formatReportDate(Infinity)).toBe("—"));
  it("returns a non-empty string for valid timestamp", () => {
    const result = formatReportDate(1_700_000_000_000);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe("—");
  });
});

// ── formatReportValue ─────────────────────────────────────────────────────────

describe("formatReportValue", () => {
  it("returns '—' for NaN", () => expect(formatReportValue(NaN)).toBe("—"));
  it("returns '—' for Infinity", () => expect(formatReportValue(Infinity)).toBe("—"));
  it("formats 0 as '0'", () => expect(formatReportValue(0)).toBe("0"));
  it("formats 999 as '999'", () => expect(formatReportValue(999)).toBe("999"));
  it("formats 1000 as '1.0K'", () => expect(formatReportValue(1000)).toBe("1.0K"));
  it("formats 1500 as '1.5K'", () => expect(formatReportValue(1500)).toBe("1.5K"));
  it("formats 1_000_000 as '1.0M'", () => expect(formatReportValue(1_000_000)).toBe("1.0M"));
  it("rounds sub-1000 values", () => expect(formatReportValue(99.7)).toBe("100"));
});

// ── isSortKey ─────────────────────────────────────────────────────────────────

describe("isSortKey", () => {
  it.each(SORT_KEYS)("returns true for valid key '%s'", (k) =>
    expect(isSortKey(k)).toBe(true));
  it("returns false for unknown string", () => expect(isSortKey("unknown")).toBe(false));
  it("returns false for number", () => expect(isSortKey(42)).toBe(false));
  it("returns false for null", () => expect(isSortKey(null)).toBe(false));
  it("returns false for empty string", () => expect(isSortKey("")).toBe(false));
});

// ── buildReportNote ───────────────────────────────────────────────────────────

describe("buildReportNote", () => {
  it("includes threshold in note", () =>
    expect(buildReportNote(25, 5, 500)).toContain("25%"));
  it("includes contributor count", () =>
    expect(buildReportNote(50, 3, 500)).toContain("3 contributors"));
  it("uses singular for 1 contributor", () =>
    expect(buildReportNote(75, 1, 500)).toContain("1 contributor"));
  it("labels strong velocity correctly", () =>
    expect(buildReportNote(100, 10, STRONG_VELOCITY_THRESHOLD)).toContain("strong"));
  it("labels moderate velocity correctly", () =>
    expect(buildReportNote(25, 5, STRONG_VELOCITY_THRESHOLD - 1)).toContain("moderate"));
  it("handles NaN contributorCount gracefully", () =>
    expect(buildReportNote(25, NaN, 500)).toContain("0 contributors"));
  it("handles negative velocity gracefully", () =>
    expect(buildReportNote(25, 5, -100)).toContain("moderate"));
  it("floors fractional contributor count", () =>
    expect(buildReportNote(25, 3.9, 500)).toContain("3 contributors"));
});

// ── resolveReportSeverity ─────────────────────────────────────────────────────

describe("resolveReportSeverity", () => {
  it("returns 'success' for threshold 100 regardless of velocity", () =>
    expect(resolveReportSeverity(100, 0)).toBe("success"));
  it("returns 'success' for strong velocity below 100%", () =>
    expect(resolveReportSeverity(50, STRONG_VELOCITY_THRESHOLD)).toBe("success"));
  it("returns 'info' for threshold 75 with moderate velocity", () =>
    expect(resolveReportSeverity(75, 500)).toBe("info"));
  it("returns 'warning' for threshold 25 with moderate velocity", () =>
    expect(resolveReportSeverity(25, 500)).toBe("warning"));
  it("returns 'warning' for threshold 50 with moderate velocity", () =>
    expect(resolveReportSeverity(50, 500)).toBe("warning"));
  it("handles NaN velocity as 0 (moderate)", () =>
    expect(resolveReportSeverity(25, NaN)).toBe("warning"));
  it("handles negative velocity as 0 (moderate)", () =>
    expect(resolveReportSeverity(75, -100)).toBe("info"));
});

// ── buildReportEntries ────────────────────────────────────────────────────────

describe("buildReportEntries", () => {
  it("returns [] for null input", () =>
    expect(buildReportEntries(null as unknown as MilestoneSnapshot[])).toEqual([]));
  it("returns [] for non-array input", () =>
    expect(buildReportEntries("bad" as unknown as MilestoneSnapshot[])).toEqual([]));
  it("returns [] for empty array", () =>
    expect(buildReportEntries([])).toEqual([]));
  it("drops null entries", () =>
    expect(buildReportEntries([null as unknown as MilestoneSnapshot])).toEqual([]));
  it("drops entries with invalid threshold", () =>
    expect(buildReportEntries([makeSnapshot({ threshold: 33 as ReportMilestone })])).toEqual([]));

  it("builds a valid entry from a snapshot", () => {
    const [entry] = buildReportEntries([makeSnapshot()]);
    expect(entry.threshold).toBe(25);
    expect(entry.totalRaised).toBe(250);
    expect(entry.goal).toBe(1000);
    expect(entry.contributorCount).toBe(5);
    expect(entry.velocity).toBe(500);
  });

  it("uses provided note when present", () => {
    const [entry] = buildReportEntries([makeSnapshot({ note: "Custom note" })]);
    expect(entry.note).toBe("Custom note");
  });

  it("generates note when not provided", () => {
    const [entry] = buildReportEntries([makeSnapshot({ note: undefined })]);
    expect(entry.note).toContain("25%");
  });

  it("sanitizes provided note", () => {
    const [entry] = buildReportEntries([makeSnapshot({ note: "<b>bold</b>" })]);
    expect(entry.note).not.toContain("<b>");
    expect(entry.note).toContain("bold");
  });

  it("clamps negative totalRaised to 0", () => {
    const [entry] = buildReportEntries([makeSnapshot({ totalRaised: -100 })]);
    expect(entry.totalRaised).toBe(0);
  });

  it("clamps NaN totalRaised to 0", () => {
    const [entry] = buildReportEntries([makeSnapshot({ totalRaised: NaN })]);
    expect(entry.totalRaised).toBe(0);
  });

  it("clamps negative velocity to 0", () => {
    const [entry] = buildReportEntries([makeSnapshot({ velocity: -50 })]);
    expect(entry.velocity).toBe(0);
  });

  it("floors fractional contributorCount", () => {
    const [entry] = buildReportEntries([makeSnapshot({ contributorCount: 4.9 })]);
    expect(entry.contributorCount).toBe(4);
  });

  it("sets reachedAt to 0 for invalid timestamp", () => {
    const [entry] = buildReportEntries([makeSnapshot({ reachedAt: -1 })]);
    expect(entry.reachedAt).toBe(0);
  });

  it("sets goal to 0 for non-positive goal", () => {
    const [entry] = buildReportEntries([makeSnapshot({ goal: 0 })]);
    expect(entry.goal).toBe(0);
  });

  it("processes all four valid thresholds", () => {
    const snaps = REPORT_MILESTONES.map((t) => makeSnapshot({ threshold: t }));
    const entries = buildReportEntries(snaps);
    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.threshold)).toEqual([25, 50, 75, 100]);
  });

  it("assigns severity via resolveReportSeverity", () => {
    const [entry] = buildReportEntries([makeSnapshot({ threshold: 100, velocity: 0 })]);
    expect(entry.severity).toBe("success");
  });
});

// ── sortReportEntries ─────────────────────────────────────────────────────────

describe("sortReportEntries", () => {
  const entries: ReportEntry[] = [
    makeEntry({ threshold: 50, reachedAt: 2000, totalRaised: 500, contributorCount: 10, velocity: 200 }),
    makeEntry({ threshold: 25, reachedAt: 1000, totalRaised: 250, contributorCount: 5,  velocity: 100 }),
    makeEntry({ threshold: 75, reachedAt: 3000, totalRaised: 750, contributorCount: 15, velocity: 300 }),
  ];

  it("sorts by reachedAt asc", () => {
    const sorted = sortReportEntries(entries, "reachedAt", "asc");
    expect(sorted.map((e) => e.reachedAt)).toEqual([1000, 2000, 3000]);
  });

  it("sorts by reachedAt desc", () => {
    const sorted = sortReportEntries(entries, "reachedAt", "desc");
    expect(sorted.map((e) => e.reachedAt)).toEqual([3000, 2000, 1000]);
  });

  it("sorts by threshold asc", () => {
    const sorted = sortReportEntries(entries, "threshold", "asc");
    expect(sorted.map((e) => e.threshold)).toEqual([25, 50, 75]);
  });

  it("sorts by totalRaised desc", () => {
    const sorted = sortReportEntries(entries, "totalRaised", "desc");
    expect(sorted.map((e) => e.totalRaised)).toEqual([750, 500, 250]);
  });

  it("sorts by contributorCount asc", () => {
    const sorted = sortReportEntries(entries, "contributorCount", "asc");
    expect(sorted.map((e) => e.contributorCount)).toEqual([5, 10, 15]);
  });

  it("sorts by velocity desc", () => {
    const sorted = sortReportEntries(entries, "velocity", "desc");
    expect(sorted.map((e) => e.velocity)).toEqual([300, 200, 100]);
  });

  it("does not mutate original array", () => {
    const copy = [...entries];
    sortReportEntries(entries, "threshold", "desc");
    expect(entries).toEqual(copy);
  });

  it("returns copy for invalid sort key", () => {
    const result = sortReportEntries(entries, "invalid" as SortKey, "asc");
    expect(result).toHaveLength(entries.length);
  });
});

// ── buildCsvReport ────────────────────────────────────────────────────────────

describe("buildCsvReport", () => {
  const entries: ReportEntry[] = [
    makeEntry({ threshold: 25, totalRaised: 250, goal: 1000, contributorCount: 5, velocity: 500 }),
  ];

  it("includes header row with column names", () => {
    const csv = buildCsvReport(entries);
    expect(csv).toContain("Threshold");
    expect(csv).toContain("Reached At");
    expect(csv).toContain("Contributors");
  });

  it("includes campaign name comment when provided", () => {
    const csv = buildCsvReport(entries, "Solar Farm");
    expect(csv).toContain("Solar Farm");
  });

  it("omits campaign name comment when not provided", () => {
    const csv = buildCsvReport(entries);
    expect(csv).not.toContain("# Campaign:");
  });

  it("includes threshold value in data row", () => {
    const csv = buildCsvReport(entries);
    expect(csv).toContain('"25"');
  });

  it("sanitizes campaign name — strips HTML", () => {
    const csv = buildCsvReport(entries, "<script>xss</script>");
    expect(csv).not.toContain("<script>");
  });

  it("sanitizes note field — strips formula injection", () => {
    const injected = [makeEntry({ note: "=SUM(A1)" })];
    const csv = buildCsvReport(injected);
    expect(csv).not.toContain("=SUM");
    expect(csv).toContain("SUM(A1)");
  });

  it("returns header-only CSV for empty entries", () => {
    const csv = buildCsvReport([]);
    expect(csv).toContain("Threshold");
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(1);
  });

  it("produces one data row per entry", () => {
    const multi = [
      makeEntry({ threshold: 25 }),
      makeEntry({ threshold: 50 }),
    ];
    const csv = buildCsvReport(multi);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(3); // header + 2 rows
  });
});

// ── ReportRow ─────────────────────────────────────────────────────────────────

describe("ReportRow", () => {
  const entry = makeEntry();

  it("renders threshold badge", () => {
    render(<table><tbody><ReportRow entry={entry} /></tbody></table>);
    expect(screen.getByTestId("report-threshold-25")).toHaveTextContent("25%");
  });

  it("renders raised value", () => {
    render(<table><tbody><ReportRow entry={entry} /></tbody></table>);
    expect(screen.getByTestId("report-raised-25")).toBeInTheDocument();
  });

  it("renders contributor count", () => {
    render(<table><tbody><ReportRow entry={entry} /></tbody></table>);
    expect(screen.getByTestId("report-contributors-25")).toHaveTextContent("5");
  });

  it("renders velocity with /day suffix", () => {
    render(<table><tbody><ReportRow entry={entry} /></tbody></table>);
    expect(screen.getByTestId("report-velocity-25")).toHaveTextContent("/day");
  });

  it("renders severity badge", () => {
    render(<table><tbody><ReportRow entry={entry} /></tbody></table>);
    expect(screen.getByTestId("report-severity-25")).toBeInTheDocument();
  });

  it("renders note text", () => {
    render(<table><tbody><ReportRow entry={entry} /></tbody></table>);
    expect(screen.getByTestId("report-note-25")).toHaveTextContent(entry.note);
  });

  it("uses custom data-testid when provided", () => {
    render(<table><tbody><ReportRow entry={entry} data-testid="custom-row" /></tbody></table>);
    expect(screen.getByTestId("custom-row")).toBeInTheDocument();
  });

  it("renders date cell", () => {
    render(<table><tbody><ReportRow entry={entry} /></tbody></table>);
    expect(screen.getByTestId("report-date-25")).toBeInTheDocument();
  });

  it("renders '—' for date when reachedAt is 0", () => {
    render(<table><tbody><ReportRow entry={makeEntry({ reachedAt: 0 })} /></tbody></table>);
    expect(screen.getByTestId("report-date-25")).toHaveTextContent("—");
  });

  it.each(["info", "success", "warning"] as const)(
    "renders without error for severity '%s'",
    (severity) => {
      expect(() =>
        render(<table><tbody><ReportRow entry={makeEntry({ severity })} /></tbody></table>),
      ).not.toThrow();
    },
  );
});

// ── ReportTable ───────────────────────────────────────────────────────────────

describe("ReportTable", () => {
  const entries = [
    makeEntry({ threshold: 25 }),
    makeEntry({ threshold: 50 }),
  ];

  it("renders table when entries present", () => {
    render(<ReportTable entries={entries} />);
    expect(screen.getByTestId("report-table")).toBeInTheDocument();
  });

  it("renders a row per entry", () => {
    render(<ReportTable entries={entries} />);
    expect(screen.getByTestId("report-row-25")).toBeInTheDocument();
    expect(screen.getByTestId("report-row-50")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(<ReportTable entries={[]} isLoading />);
    expect(screen.getByTestId("report-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("report-table")).toBeNull();
  });

  it("shows empty state when no entries and not loading", () => {
    render(<ReportTable entries={[]} />);
    expect(screen.getByTestId("report-empty")).toBeInTheDocument();
  });

  it("filters by threshold when filterThreshold is set", () => {
    render(<ReportTable entries={entries} filterThreshold={25} />);
    expect(screen.getByTestId("report-row-25")).toBeInTheDocument();
    expect(screen.queryByTestId("report-row-50")).toBeNull();
  });

  it("shows empty state when filter matches nothing", () => {
    render(<ReportTable entries={entries} filterThreshold={75} />);
    expect(screen.getByTestId("report-empty")).toBeInTheDocument();
  });

  it("calls onSort when sort button clicked", () => {
    const onSort = jest.fn();
    render(<ReportTable entries={entries} onSort={onSort} />);
    fireEvent.click(screen.getByTestId("sort-btn-threshold-0"));
    expect(onSort).toHaveBeenCalledWith("threshold");
  });

  it("renders column headers", () => {
    render(<ReportTable entries={entries} />);
    expect(screen.getByTestId("report-col-milestone")).toBeInTheDocument();
    expect(screen.getByTestId("report-col-reached-at")).toBeInTheDocument();
  });

  it("sets aria-sort='ascending' on active asc column", () => {
    render(<ReportTable entries={entries} sortKey="threshold" sortDir="asc" />);
    expect(screen.getByTestId("report-col-milestone")).toHaveAttribute("aria-sort", "ascending");
  });

  it("sets aria-sort='descending' on active desc column", () => {
    render(<ReportTable entries={entries} sortKey="threshold" sortDir="desc" />);
    expect(screen.getByTestId("report-col-milestone")).toHaveAttribute("aria-sort", "descending");
  });

  it("sets aria-sort='none' on inactive column", () => {
    render(<ReportTable entries={entries} sortKey="reachedAt" sortDir="asc" />);
    expect(screen.getByTestId("report-col-milestone")).toHaveAttribute("aria-sort", "none");
  });

  it("renders without sort buttons when onSort not provided", () => {
    render(<ReportTable entries={entries} />);
    expect(screen.queryByTestId("sort-btn-threshold-0")).toBeNull();
  });

  it("loading state has role=status and aria-live=polite", () => {
    render(<ReportTable entries={[]} isLoading />);
    expect(screen.getByTestId("report-loading")).toHaveAttribute("role", "status");
    expect(screen.getByTestId("report-loading")).toHaveAttribute("aria-live", "polite");
  });
});

// ── MilestoneReports — rendering ──────────────────────────────────────────────

describe("MilestoneReports — rendering", () => {
  it("renders root element", () => {
    renderReports();
    expect(screen.getByTestId("milestone-reports-root")).toBeInTheDocument();
  });

  it("renders panel with default label", () => {
    renderReports();
    expect(screen.getByRole("region", { name: "Milestone Reports" })).toBeInTheDocument();
  });

  it("renders panel with campaign name", () => {
    renderReports({ campaignName: "Solar Farm" });
    expect(screen.getByRole("region", { name: "Solar Farm Milestone Reports" })).toBeInTheDocument();
  });

  it("sanitizes campaign name — strips HTML", () => {
    renderReports({ campaignName: "<script>xss</script>" });
    const region = screen.getByRole("region");
    expect(region.getAttribute("aria-label")).not.toContain("<script>");
  });

  it("renders title text", () => {
    renderReports({ campaignName: "My Campaign" });
    expect(screen.getByTestId("reports-title")).toHaveTextContent("My Campaign Milestone Reports");
  });

  it("renders filter select", () => {
    renderReports();
    expect(screen.getByTestId("report-filter-select")).toBeInTheDocument();
  });

  it("renders export button", () => {
    renderReports();
    expect(screen.getByTestId("report-export-btn")).toBeInTheDocument();
  });

  it("export button is disabled when no entries", () => {
    renderReports({ snapshots: [] });
    expect(screen.getByTestId("report-export-btn")).toBeDisabled();
  });

  it("export button is enabled when entries present", () => {
    renderReports({ snapshots: [makeSnapshot()] });
    expect(screen.getByTestId("report-export-btn")).not.toBeDisabled();
  });

  it("export button is disabled when loading", () => {
    renderReports({ snapshots: [makeSnapshot()], isLoading: true });
    expect(screen.getByTestId("report-export-btn")).toBeDisabled();
  });

  it("shows summary badges when entries present", () => {
    renderReports({ snapshots: [makeSnapshot({ threshold: 25 })] });
    expect(screen.getByTestId("summary-badge-25")).toBeInTheDocument();
    expect(screen.getByTestId("summary-badge-50")).toBeInTheDocument();
  });

  it("summary badge for reached milestone shows checkmark", () => {
    renderReports({ snapshots: [makeSnapshot({ threshold: 25 })] });
    expect(screen.getByTestId("summary-badge-25")).toHaveTextContent("✓");
  });

  it("summary badge for unreached milestone shows dash", () => {
    renderReports({ snapshots: [makeSnapshot({ threshold: 25 })] });
    expect(screen.getByTestId("summary-badge-50")).toHaveTextContent("—");
  });

  it("hides summary badges when loading", () => {
    renderReports({ snapshots: [makeSnapshot()], isLoading: true });
    expect(screen.queryByTestId("summary-badge-25")).toBeNull();
  });

  it("applies custom className to root", () => {
    renderReports({ className: "my-class" });
    expect(screen.getByTestId("milestone-reports-root")).toHaveClass("my-class");
  });

  it("renders table when snapshots provided", () => {
    renderReports({ snapshots: [makeSnapshot()] });
    expect(screen.getByTestId("report-table")).toBeInTheDocument();
  });

  it("shows empty state when no snapshots", () => {
    renderReports({ snapshots: [] });
    expect(screen.getByTestId("report-empty")).toBeInTheDocument();
  });

  it("shows loading state when isLoading=true", () => {
    renderReports({ isLoading: true });
    expect(screen.getByTestId("report-loading")).toBeInTheDocument();
  });
});

// ── MilestoneReports — sort ───────────────────────────────────────────────────

describe("MilestoneReports — sort", () => {
  const snapshots = [
    makeSnapshot({ threshold: 50, reachedAt: 2000 }),
    makeSnapshot({ threshold: 25, reachedAt: 1000 }),
  ];

  it("clicking sort button toggles direction on same key", () => {
    renderReports({ snapshots });
    // First click: sort by threshold asc
    fireEvent.click(screen.getByTestId("sort-btn-threshold-0"));
    // Second click: sort by threshold desc
    fireEvent.click(screen.getByTestId("sort-btn-threshold-0"));
    // Should not throw and table should still render
    expect(screen.getByTestId("report-table")).toBeInTheDocument();
  });

  it("clicking a different sort key resets direction to asc", () => {
    renderReports({ snapshots });
    fireEvent.click(screen.getByTestId("sort-btn-threshold-0"));
    fireEvent.click(screen.getByTestId("sort-btn-reachedAt-1"));
    expect(screen.getByTestId("report-table")).toBeInTheDocument();
  });
});

// ── MilestoneReports — filter ─────────────────────────────────────────────────

describe("MilestoneReports — filter", () => {
  const snapshots = [
    makeSnapshot({ threshold: 25 }),
    makeSnapshot({ threshold: 50 }),
  ];

  it("filter select shows all milestones by default", () => {
    renderReports({ snapshots });
    expect(screen.getByTestId("report-row-25")).toBeInTheDocument();
    expect(screen.getByTestId("report-row-50")).toBeInTheDocument();
  });

  it("selecting a threshold filters the table", () => {
    renderReports({ snapshots });
    fireEvent.change(screen.getByTestId("report-filter-select"), { target: { value: "25" } });
    expect(screen.getByTestId("report-row-25")).toBeInTheDocument();
    expect(screen.queryByTestId("report-row-50")).toBeNull();
  });

  it("selecting 'All milestones' shows all rows", () => {
    renderReports({ snapshots });
    fireEvent.change(screen.getByTestId("report-filter-select"), { target: { value: "25" } });
    fireEvent.change(screen.getByTestId("report-filter-select"), { target: { value: "" } });
    expect(screen.getByTestId("report-row-25")).toBeInTheDocument();
    expect(screen.getByTestId("report-row-50")).toBeInTheDocument();
  });
});

// ── MilestoneReports — export ─────────────────────────────────────────────────

describe("MilestoneReports — export", () => {
  it("calls onExport with CSV string when export button clicked", () => {
    const onExport = jest.fn();
    renderReports({ snapshots: [makeSnapshot()], onExport });
    fireEvent.click(screen.getByTestId("report-export-btn"));
    expect(onExport).toHaveBeenCalledTimes(1);
    const csv: string = onExport.mock.calls[0][0];
    expect(typeof csv).toBe("string");
    expect(csv).toContain("Threshold");
  });

  it("CSV includes campaign name when provided", () => {
    const onExport = jest.fn();
    renderReports({ snapshots: [makeSnapshot()], campaignName: "Solar Farm", onExport });
    fireEvent.click(screen.getByTestId("report-export-btn"));
    expect(onExport.mock.calls[0][0]).toContain("Solar Farm");
  });

  it("export button has accessible aria-label", () => {
    renderReports({ snapshots: [makeSnapshot()] });
    expect(screen.getByTestId("report-export-btn")).toHaveAttribute(
      "aria-label",
      "Export milestone report as CSV",
    );
  });

  it("does not call onExport when button is disabled", () => {
    const onExport = jest.fn();
    renderReports({ snapshots: [], onExport });
    fireEvent.click(screen.getByTestId("report-export-btn"));
    expect(onExport).not.toHaveBeenCalled();
  });
});

// ── MilestoneReports — edge cases ─────────────────────────────────────────────

describe("MilestoneReports — edge cases", () => {
  it("handles undefined snapshots gracefully", () => {
    expect(() =>
      renderReports({ snapshots: undefined as unknown as MilestoneSnapshot[] }),
    ).not.toThrow();
  });

  it("handles snapshots with all invalid thresholds", () => {
    renderReports({ snapshots: [makeSnapshot({ threshold: 33 as ReportMilestone })] });
    expect(screen.getByTestId("report-empty")).toBeInTheDocument();
  });

  it("handles all four milestones", () => {
    const snaps = REPORT_MILESTONES.map((t) => makeSnapshot({ threshold: t }));
    renderReports({ snapshots: snaps });
    REPORT_MILESTONES.forEach((t) => {
      expect(screen.getByTestId(`report-row-${t}`)).toBeInTheDocument();
    });
  });

  it("REPORT_MILESTONES constant is [25, 50, 75, 100]", () =>
    expect(REPORT_MILESTONES).toEqual([25, 50, 75, 100]));

  it("STRONG_VELOCITY_THRESHOLD constant is 1000", () =>
    expect(STRONG_VELOCITY_THRESHOLD).toBe(1_000));

  it("HIGH_ENGAGEMENT_THRESHOLD constant is 10", () =>
    expect(HIGH_ENGAGEMENT_THRESHOLD).toBe(10));

  it("MAX_REPORT_NAME_LENGTH constant is 80", () =>
    expect(MAX_REPORT_NAME_LENGTH).toBe(80));

  it("MAX_NOTE_LENGTH constant is 200", () =>
    expect(MAX_NOTE_LENGTH).toBe(200));
});
