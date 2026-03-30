# milestone_reports

> **Component:** `frontend/components/milestone_reports.tsx`
> **Tests:** `frontend/components/milestone_reports.test.tsx`
> **Issue:** create-campaign-milestone-celebration-reports-for-frontend-ui

---

## Overview

`MilestoneReports` is a React component that generates structured, exportable
milestone celebration reports for the Stellar Raise crowdfunding dApp. It
converts raw `MilestoneSnapshot[]` data into a sortable, filterable report
table with per-row severity classification, summary badges, and one-click CSV
export. Each report entry captures the funding state at the exact moment a
threshold (25%, 50%, 75%, 100%) was crossed.

---

## Security Assumptions

| # | Assumption |
|---|-----------|
| 1 | No `dangerouslySetInnerHTML` anywhere in this module. |
| 2 | All user-supplied strings pass through `sanitizeReportString`: control characters stripped, HTML tags stripped, whitespace collapsed, length capped. |
| 3 | CSV export sanitizes every field via `sanitizeCsvField` to prevent formula injection (CWE-1236): leading `=`, `+`, `-`, `@`, TAB, CR characters are stripped. |
| 4 | Sort keys are validated against the `SORT_KEYS` allowlist via `isSortKey` before property access — prevents arbitrary key injection. |
| 5 | Percentage values are clamped to `[0, 100]` before CSS injection. |
| 6 | Severity colors are sourced from a hardcoded map — no user-controlled CSS values. |
| 7 | All numeric inputs are validated with `Number.isFinite` and clamped to ≥ 0 before use. |

---

## Exported API

### Constants

| Name | Value | Description |
|------|-------|-------------|
| `REPORT_MILESTONES` | `[25, 50, 75, 100]` | Supported thresholds |
| `SORT_KEYS` | `["threshold","reachedAt","totalRaised","contributorCount","velocity"]` | Valid sort columns |
| `MAX_REPORT_NAME_LENGTH` | `80` | Max chars for campaign name |
| `MAX_NOTE_LENGTH` | `200` | Max chars for note field |
| `STRONG_VELOCITY_THRESHOLD` | `1000` | Tokens/day for "strong" velocity |
| `HIGH_ENGAGEMENT_THRESHOLD` | `10` | Contributors for "high engagement" |

### Pure helpers

| Function | Description |
|----------|-------------|
| `clampReportPercent(value)` | Clamps to `[0, 100]`; returns 0 for NaN/non-finite |
| `sanitizeReportString(input, maxLength)` | Strips control chars, HTML tags, collapses whitespace, truncates |
| `sanitizeCsvField(value)` | Strips formula-injection prefixes, escapes quotes, wraps in `"…"` |
| `formatReportDate(tsMs)` | Formats Unix ms timestamp as locale string; "—" for invalid |
| `formatReportValue(value)` | Abbreviates K/M; "—" for non-finite |
| `isSortKey(key)` | Type-guard validating against `SORT_KEYS` allowlist |
| `buildReportNote(threshold, contributors, velocity)` | Generates plain-text summary note |
| `resolveReportSeverity(threshold, velocity)` | Returns `ReportSeverity` for a milestone entry |
| `buildReportEntries(snapshots)` | Converts raw snapshots to validated `ReportEntry[]` |
| `sortReportEntries(entries, key, dir)` | Sorts entries by validated key and direction |
| `buildCsvReport(entries, campaignName?)` | Serializes entries to CSV with formula-injection protection |

### Components

| Component | Description |
|-----------|-------------|
| `ReportRow` | Single report entry as a table row |
| `ReportTable` | Sortable, filterable table with loading/empty states |
| `MilestoneReports` | Main component: summary badges + table + filter + CSV export |

### Types

| Type | Description |
|------|-------------|
| `ReportMilestone` | `25 \| 50 \| 75 \| 100` |
| `SortKey` | Union of valid sort column names |
| `SortDir` | `"asc" \| "desc"` |
| `ReportSeverity` | `"info" \| "success" \| "warning"` |
| `ReportEntry` | Validated, display-ready report row |
| `MilestoneSnapshot` | Raw input snapshot from API or chain indexer |
| `MilestoneReportsProps` | Props for `MilestoneReports` |

---

## Component Props

### MilestoneReports

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `snapshots` | `MilestoneSnapshot[]` | required | Raw milestone snapshots |
| `campaignName` | `string` | — | Optional name shown in header and CSV |
| `isLoading` | `boolean` | `false` | Shows loading state when true |
| `onExport` | `(csv: string) => void` | — | Called with CSV string on export |
| `className` | `string` | — | Additional CSS class for root element |

### MilestoneSnapshot shape

| Field | Type | Description |
|-------|------|-------------|
| `threshold` | `ReportMilestone` | Milestone percentage (25/50/75/100) |
| `reachedAt` | `number` | Unix timestamp (ms) when crossed |
| `totalRaised` | `number` | Tokens raised at crossing |
| `goal` | `number` | Campaign funding goal |
| `contributorCount` | `number` | Unique contributors at crossing |
| `velocity` | `number` | Tokens/day at crossing |
| `note` | `string?` | Optional custom note (sanitized) |

---

## Severity Logic

| Condition | Severity |
|-----------|----------|
| `threshold === 100` | `success` |
| `velocity >= 1000` (any threshold) | `success` |
| `threshold >= 75` with moderate velocity | `info` |
| `threshold < 75` with moderate velocity | `warning` |

---

## Usage

```tsx
import MilestoneReports from "@/components/milestone_reports";

<MilestoneReports
  snapshots={milestoneHistory}
  campaignName="Solar Farm Project"
  onExport={(csv) => {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "milestone_report.csv";
    a.click();
  }}
/>
```

---

## Accessibility

- `role="region"` with `aria-label` on the reports panel for landmark navigation.
- Full ARIA table semantics: `role="table"`, `role="rowgroup"`, `role="row"`, `role="columnheader"`, `role="cell"`.
- Sort buttons carry `aria-sort` (`"ascending"` | `"descending"` | `"none"`).
- Loading and empty states use `role="status"` + `aria-live="polite"`.
- Export button has `aria-label="Export milestone report as CSV"`.
- All interactive elements meet 44×44 px minimum touch target.

---

## Running the Tests

```bash
# Run milestone reports tests only
npx jest milestone_reports --coverage

# Run all frontend tests
npm test
```

Expected: all tests pass, ≥ 95% coverage.
