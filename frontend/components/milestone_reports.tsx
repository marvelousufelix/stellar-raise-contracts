import React, { useCallback, useMemo, useState } from "react";

/**
 * @title MilestoneReports
 * @notice Campaign milestone celebration reports panel for the Stellar Raise
 *         crowdfunding dApp. Generates structured, exportable milestone reports
 *         summarising funding progress, contributor activity, velocity trends,
 *         and celebration history for each threshold crossed (25%, 50%, 75%, 100%).
 *
 * @dev Exports:
 *   - Pure helper functions (all exported for independent unit testing)
 *   - `ReportRow`          — single report entry row
 *   - `ReportTable`        — sortable, filterable report table with empty/loading states
 *   - `MilestoneReports`   — main component: report generation + table + export
 *
 * @custom:efficiency
 *   - `useMemo` derives report rows only when inputs change.
 *   - `useCallback` stabilises sort/filter handlers to prevent child re-renders.
 *   - Report generation is a pure function — safe to memoize and test in isolation.
 *
 * @custom:security
 *   - No `dangerouslySetInnerHTML` anywhere in this module.
 *   - All user-supplied strings are rendered as React text nodes (XSS-safe).
 *   - Numeric inputs are validated with `Number.isFinite` before use.
 *   - Percentage values are clamped to [0, 100] before CSS injection.
 *   - CSV export sanitizes all fields to prevent formula injection.
 *   - Sort keys are validated against an allowlist before use.
 *
 * @custom:accessibility
 *   - `role="region"` with `aria-label` on the reports panel.
 *   - `role="table"`, `role="rowgroup"`, `role="row"`, `role="columnheader"`,
 *     `role="cell"` for full table semantics.
 *   - Sort buttons carry `aria-sort` attributes.
 *   - Status messages use `role="status"` + `aria-live="polite"`.
 *   - Export button has descriptive `aria-label`.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Supported milestone thresholds as funding percentages. */
export const REPORT_MILESTONES = [25, 50, 75, 100] as const;
export type ReportMilestone = (typeof REPORT_MILESTONES)[number];

/** Maximum characters for campaign name display. */
export const MAX_REPORT_NAME_LENGTH = 80;

/** Maximum characters for a note field. */
export const MAX_NOTE_LENGTH = 200;

/** Valid sort column keys. */
export const SORT_KEYS = ["threshold", "reachedAt", "totalRaised", "contributorCount", "velocity"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** Sort direction. */
export type SortDir = "asc" | "desc";

/** Minimum daily velocity (tokens/day) considered "strong". */
export const STRONG_VELOCITY_THRESHOLD = 1_000;

/** Minimum contributor count considered "high engagement". */
export const HIGH_ENGAGEMENT_THRESHOLD = 10;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Report row severity — used for row highlight and badge colour. */
export type ReportSeverity = "info" | "success" | "warning";

/**
 * @notice A single milestone report entry.
 *
 * @param threshold        Milestone percentage threshold.
 * @param reachedAt        Unix timestamp (ms) when the milestone was reached.
 * @param totalRaised      Total tokens raised at the moment of crossing.
 * @param goal             Campaign funding goal.
 * @param contributorCount Unique contributors at the moment of crossing.
 * @param velocity         Tokens raised per day at the moment of crossing.
 * @param note             Optional human-readable summary note (sanitized).
 * @param severity         Display severity for the row.
 */
export interface ReportEntry {
  threshold: ReportMilestone;
  reachedAt: number;
  totalRaised: number;
  goal: number;
  contributorCount: number;
  velocity: number;
  note: string;
  severity: ReportSeverity;
}

/**
 * @notice Raw campaign snapshot at the moment a milestone was crossed.
 * All numeric fields are validated before use.
 */
export interface MilestoneSnapshot {
  threshold: ReportMilestone;
  reachedAt: number;
  totalRaised: number;
  goal: number;
  contributorCount: number;
  velocity: number;
  note?: string;
}

/**
 * @notice Props for `ReportRow`.
 */
export interface ReportRowProps {
  entry: ReportEntry;
  "data-testid"?: string;
}

/**
 * @notice Props for `ReportTable`.
 */
export interface ReportTableProps {
  entries: ReportEntry[];
  isLoading?: boolean;
  sortKey?: SortKey;
  sortDir?: SortDir;
  onSort?: (key: SortKey) => void;
  filterThreshold?: ReportMilestone | null;
}

/**
 * @notice Props for `MilestoneReports`.
 */
export interface MilestoneReportsProps {
  /** Raw milestone snapshots to build the report from. */
  snapshots: MilestoneSnapshot[];
  /** Optional campaign name shown in the panel header. */
  campaignName?: string;
  /** Whether data is still loading. */
  isLoading?: boolean;
  /** Called when the user exports the report as CSV. */
  onExport?: (csv: string) => void;
  /** Additional CSS class for the root element. */
  className?: string;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * @title clampReportPercent
 * @notice Clamps a value to [0, 100]. Returns 0 for NaN or non-finite input.
 */
export function clampReportPercent(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/**
 * @title sanitizeReportString
 * @notice Sanitizes a user-supplied string for safe display and CSV export.
 *   - Rejects non-strings.
 *   - Strips control characters (U+0000–U+001F, U+007F).
 *   - Strips HTML-like tags.
 *   - Collapses whitespace.
 *   - Truncates to maxLength.
 * @param input     Raw string.
 * @param maxLength Maximum allowed length.
 * @returns Sanitized string, or "" on invalid input.
 */
export function sanitizeReportString(input: unknown, maxLength: number): string {
  if (typeof input !== "string") return "";
  const cleaned = input
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, maxLength);
}

/**
 * @title sanitizeCsvField
 * @notice Sanitizes a string for safe inclusion in a CSV cell.
 *   - Strips leading formula-injection characters (=, +, -, @, TAB, CR).
 *   - Escapes double-quotes by doubling them.
 *   - Wraps the result in double-quotes.
 * @param value Raw string value.
 * @returns CSV-safe quoted string.
 *
 * @custom:security Prevents CSV formula injection (CWE-1236).
 */
export function sanitizeCsvField(value: string): string {
  const stripped = value.replace(/^[=+\-@\t\r]+/, "");
  const escaped = stripped.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * @title formatReportDate
 * @notice Formats a Unix timestamp (ms) as a locale date-time string.
 *         Returns "—" for invalid input.
 * @param tsMs Unix timestamp in milliseconds.
 * @returns Formatted date string or "—".
 */
export function formatReportDate(tsMs: number): string {
  if (!Number.isFinite(tsMs) || tsMs <= 0) return "—";
  return new Date(tsMs).toLocaleString();
}

/**
 * @title formatReportValue
 * @notice Abbreviates large numbers for display (K / M).
 *         Returns "—" for non-finite input.
 */
export function formatReportValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

/**
 * @title isSortKey
 * @notice Type-guard that validates a string against the SORT_KEYS allowlist.
 * @param key Candidate sort key.
 * @returns True if key is a valid SortKey.
 *
 * @custom:security Prevents arbitrary property access via sort key injection.
 */
export function isSortKey(key: unknown): key is SortKey {
  return typeof key === "string" && (SORT_KEYS as readonly string[]).includes(key);
}

/**
 * @title buildReportNote
 * @notice Generates a human-readable summary note for a milestone entry.
 * @param threshold        Milestone percentage.
 * @param contributorCount Contributors at crossing.
 * @param velocity         Daily velocity at crossing.
 * @returns Plain-text note string.
 */
export function buildReportNote(
  threshold: ReportMilestone,
  contributorCount: number,
  velocity: number,
): string {
  const contributors = Number.isFinite(contributorCount) && contributorCount >= 0
    ? Math.floor(contributorCount)
    : 0;
  const vel = Number.isFinite(velocity) && velocity >= 0 ? velocity : 0;
  const velLabel = vel >= STRONG_VELOCITY_THRESHOLD ? "strong" : "moderate";
  return `${threshold}% milestone reached with ${contributors} contributor${contributors === 1 ? "" : "s"} and ${velLabel} velocity.`;
}

/**
 * @title resolveReportSeverity
 * @notice Determines the display severity for a report entry.
 * @param threshold  Milestone percentage.
 * @param velocity   Daily velocity at crossing.
 * @returns ReportSeverity value.
 */
export function resolveReportSeverity(
  threshold: ReportMilestone,
  velocity: number,
): ReportSeverity {
  if (threshold === 100) return "success";
  const vel = Number.isFinite(velocity) && velocity >= 0 ? velocity : 0;
  if (vel >= STRONG_VELOCITY_THRESHOLD) return "success";
  if (threshold >= 75) return "info";
  return "warning";
}

/**
 * @title buildReportEntries
 * @notice Converts raw MilestoneSnapshot[] into validated ReportEntry[].
 *         Invalid snapshots are silently dropped.
 *
 * @param snapshots Raw snapshot array from the caller.
 * @returns Array of validated, sanitized ReportEntry objects.
 *
 * @custom:security All string fields are sanitized. Numeric fields are
 *                  validated with Number.isFinite and clamped to ≥ 0.
 */
export function buildReportEntries(snapshots: MilestoneSnapshot[]): ReportEntry[] {
  if (!Array.isArray(snapshots)) return [];
  const entries: ReportEntry[] = [];

  for (const snap of snapshots) {
    if (!snap || typeof snap !== "object") continue;
    if (!(REPORT_MILESTONES as readonly number[]).includes(snap.threshold)) continue;

    const threshold = snap.threshold as ReportMilestone;
    const reachedAt = Number.isFinite(snap.reachedAt) && snap.reachedAt > 0
      ? snap.reachedAt : 0;
    const totalRaised = Number.isFinite(snap.totalRaised) && snap.totalRaised >= 0
      ? snap.totalRaised : 0;
    const goal = Number.isFinite(snap.goal) && snap.goal > 0 ? snap.goal : 0;
    const contributorCount = Number.isFinite(snap.contributorCount) && snap.contributorCount >= 0
      ? Math.floor(snap.contributorCount) : 0;
    const velocity = Number.isFinite(snap.velocity) && snap.velocity >= 0
      ? snap.velocity : 0;
    const rawNote = snap.note
      ? sanitizeReportString(snap.note, MAX_NOTE_LENGTH)
      : buildReportNote(threshold, contributorCount, velocity);

    entries.push({
      threshold,
      reachedAt,
      totalRaised,
      goal,
      contributorCount,
      velocity,
      note: rawNote,
      severity: resolveReportSeverity(threshold, velocity),
    });
  }

  return entries;
}

/**
 * @title sortReportEntries
 * @notice Sorts a ReportEntry array by the given key and direction.
 *         Falls back to identity order for invalid sort keys.
 *
 * @param entries Entries to sort (not mutated).
 * @param key     Sort column key (validated against SORT_KEYS allowlist).
 * @param dir     Sort direction.
 * @returns New sorted array.
 *
 * @custom:security key is validated via isSortKey before property access.
 */
export function sortReportEntries(
  entries: ReportEntry[],
  key: SortKey,
  dir: SortDir,
): ReportEntry[] {
  if (!isSortKey(key)) return [...entries];
  return [...entries].sort((a, b) => {
    const av = a[key] as number;
    const bv = b[key] as number;
    return dir === "asc" ? av - bv : bv - av;
  });
}

/**
 * @title buildCsvReport
 * @notice Serializes ReportEntry[] to a CSV string.
 *         All fields are sanitized to prevent formula injection.
 *
 * @param entries    Report entries to serialize.
 * @param campaignName Optional campaign name for the header row.
 * @returns CSV string with header row.
 *
 * @custom:security Each field passes through sanitizeCsvField (CWE-1236).
 */
export function buildCsvReport(entries: ReportEntry[], campaignName?: string): string {
  const safeName = sanitizeReportString(campaignName ?? "", MAX_REPORT_NAME_LENGTH);
  const header = safeName
    ? `# Campaign: ${safeName}\n`
    : "";
  const cols = ["Threshold (%)", "Reached At", "Total Raised", "Goal", "Contributors", "Velocity/day", "Note"];
  const rows = entries.map((e) => [
    sanitizeCsvField(String(e.threshold)),
    sanitizeCsvField(formatReportDate(e.reachedAt)),
    sanitizeCsvField(String(e.totalRaised)),
    sanitizeCsvField(String(e.goal)),
    sanitizeCsvField(String(e.contributorCount)),
    sanitizeCsvField(String(Math.round(e.velocity))),
    sanitizeCsvField(e.note),
  ].join(","));
  return header + [cols.map(sanitizeCsvField).join(","), ...rows].join("\n");
}

// ── Severity helpers ──────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<ReportSeverity, string> = {
  info:    "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
};

const SEVERITY_LABELS: Record<ReportSeverity, string> = {
  info:    "Info",
  success: "Success",
  warning: "Warning",
};

// ── ReportRow ─────────────────────────────────────────────────────────────────

/**
 * @title ReportRow
 * @notice Renders a single milestone report entry as a table row.
 *
 * @custom:security No user-controlled values reach style attributes except
 *                  the severity color, which is sourced from a hardcoded map.
 */
export const ReportRow: React.FC<ReportRowProps> = ({
  entry,
  "data-testid": testId,
}) => {
  const color = SEVERITY_COLORS[entry.severity];
  return (
    <tr
      role="row"
      data-testid={testId ?? `report-row-${entry.threshold}`}
      style={{ borderBottom: "1px solid #e5e7eb" }}
    >
      <td role="cell" data-testid={`report-threshold-${entry.threshold}`}
        style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>
        <span
          style={{
            display: "inline-block",
            padding: "0.15rem 0.5rem",
            borderRadius: 4,
            background: color,
            color: "#fff",
            fontSize: "0.8rem",
          }}
        >
          {entry.threshold}%
        </span>
      </td>
      <td role="cell" data-testid={`report-date-${entry.threshold}`}
        style={{ padding: "0.6rem 0.75rem", fontSize: "0.85rem", color: "#374151" }}>
        {formatReportDate(entry.reachedAt)}
      </td>
      <td role="cell" data-testid={`report-raised-${entry.threshold}`}
        style={{ padding: "0.6rem 0.75rem" }}>
        {formatReportValue(entry.totalRaised)}
      </td>
      <td role="cell" data-testid={`report-goal-${entry.threshold}`}
        style={{ padding: "0.6rem 0.75rem", color: "#6b7280" }}>
        {formatReportValue(entry.goal)}
      </td>
      <td role="cell" data-testid={`report-contributors-${entry.threshold}`}
        style={{ padding: "0.6rem 0.75rem" }}>
        {entry.contributorCount}
      </td>
      <td role="cell" data-testid={`report-velocity-${entry.threshold}`}
        style={{ padding: "0.6rem 0.75rem" }}>
        {formatReportValue(entry.velocity)}/day
      </td>
      <td role="cell" data-testid={`report-severity-${entry.threshold}`}
        style={{ padding: "0.6rem 0.75rem" }}>
        <span
          aria-label={`Severity: ${SEVERITY_LABELS[entry.severity]}`}
          style={{ color, fontWeight: 600, fontSize: "0.8rem" }}
        >
          {SEVERITY_LABELS[entry.severity]}
        </span>
      </td>
      <td role="cell" data-testid={`report-note-${entry.threshold}`}
        style={{ padding: "0.6rem 0.75rem", fontSize: "0.8rem", color: "#6b7280", maxWidth: 260 }}>
        {entry.note}
      </td>
    </tr>
  );
};

// ── ReportTable ───────────────────────────────────────────────────────────────

const COLUMN_HEADERS: { key: SortKey; label: string }[] = [
  { key: "threshold",        label: "Milestone" },
  { key: "reachedAt",        label: "Reached At" },
  { key: "totalRaised",      label: "Raised" },
  { key: "totalRaised",      label: "Goal" },       // display-only column, same sort key
  { key: "contributorCount", label: "Contributors" },
  { key: "velocity",         label: "Velocity" },
];

/**
 * @title ReportTable
 * @notice Renders a sortable milestone report table with loading and empty states.
 *
 * @custom:accessibility
 *   - Full ARIA table semantics (role="table/rowgroup/row/columnheader/cell").
 *   - Sort buttons carry `aria-sort` ("ascending" | "descending" | "none").
 *   - Loading and empty states use `role="status"` + `aria-live="polite"`.
 */
export const ReportTable: React.FC<ReportTableProps> = ({
  entries,
  isLoading = false,
  sortKey = "reachedAt",
  sortDir = "asc",
  onSort,
  filterThreshold = null,
}) => {
  const visible = filterThreshold != null
    ? entries.filter((e) => e.threshold === filterThreshold)
    : entries;

  if (isLoading) {
    return (
      <p role="status" aria-live="polite" data-testid="report-loading">
        Loading report…
      </p>
    );
  }

  if (visible.length === 0) {
    return (
      <p role="status" aria-live="polite" data-testid="report-empty"
        style={{ color: "#6b7280" }}>
        No milestone report data available yet.
      </p>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        role="table"
        data-testid="report-table"
        style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}
      >
        <thead role="rowgroup" data-testid="report-thead">
          <tr role="row">
            {COLUMN_HEADERS.map(({ key, label }, i) => {
              const isActive = sortKey === key;
              const ariaSort = isActive
                ? sortDir === "asc" ? "ascending" : "descending"
                : "none";
              return (
                <th
                  key={`${key}-${i}`}
                  role="columnheader"
                  aria-sort={ariaSort as React.AriaAttributes["aria-sort"]}
                  data-testid={`report-col-${label.toLowerCase().replace(/\s+/g, "-")}`}
                  style={{
                    padding: "0.6rem 0.75rem",
                    textAlign: "left",
                    background: "#f9fafb",
                    borderBottom: "2px solid #e5e7eb",
                    whiteSpace: "nowrap",
                  }}
                >
                  {onSort ? (
                    <button
                      onClick={() => onSort(key)}
                      aria-label={`Sort by ${label}`}
                      data-testid={`sort-btn-${key}-${i}`}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontWeight: isActive ? 700 : 400,
                        padding: 0,
                        fontSize: "inherit",
                        color: isActive ? "#111827" : "#6b7280",
                      }}
                    >
                      {label} {isActive ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </button>
                  ) : (
                    label
                  )}
                </th>
              );
            })}
            <th role="columnheader" data-testid="report-col-note"
              style={{ padding: "0.6rem 0.75rem", background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
              Note
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup" data-testid="report-tbody">
          {visible.map((entry) => (
            <ReportRow key={entry.threshold} entry={entry} />
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── MilestoneReports ──────────────────────────────────────────────────────────

/**
 * @title MilestoneReports
 * @notice Main component. Converts raw MilestoneSnapshot[] into a sortable,
 *         filterable report table with CSV export capability.
 *
 * @dev Renders an empty state when no valid snapshots are provided.
 *      All sort/filter state is managed internally; callers receive the
 *      final CSV string via the `onExport` callback.
 */
const MilestoneReports: React.FC<MilestoneReportsProps> = ({
  snapshots,
  campaignName,
  isLoading = false,
  onExport,
  className,
}) => {
  const [sortKey, setSortKey] = useState<SortKey>("reachedAt");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterThreshold, setFilterThreshold] = useState<ReportMilestone | null>(null);

  const safeName = sanitizeReportString(campaignName ?? "", MAX_REPORT_NAME_LENGTH);
  const panelLabel = safeName ? `${safeName} Milestone Reports` : "Milestone Reports";

  const entries = useMemo(() => buildReportEntries(snapshots), [snapshots]);
  const sorted  = useMemo(() => sortReportEntries(entries, sortKey, sortDir), [entries, sortKey, sortDir]);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else setSortDir("asc");
      return key;
    });
  }, []);

  const handleExport = useCallback(() => {
    const csv = buildCsvReport(sorted, campaignName);
    onExport?.(csv);
  }, [sorted, campaignName, onExport]);

  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = Number(e.target.value);
      setFilterThreshold(
        (REPORT_MILESTONES as readonly number[]).includes(val)
          ? (val as ReportMilestone)
          : null,
      );
    },
    [],
  );

  return (
    <section
      role="region"
      aria-label={panelLabel}
      data-testid="milestone-reports-root"
      className={className}
      style={{ fontFamily: "system-ui, sans-serif", padding: "1rem 0" }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginBottom: "0.75rem",
        }}
      >
        <h3
          data-testid="reports-title"
          style={{ margin: 0, fontSize: "1rem", color: "#111827" }}
        >
          {panelLabel}
        </h3>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {/* Filter */}
          <label htmlFor="report-filter" style={{ fontSize: "0.85rem", color: "#6b7280" }}>
            Filter:
          </label>
          <select
            id="report-filter"
            data-testid="report-filter-select"
            value={filterThreshold ?? ""}
            onChange={handleFilterChange}
            style={{ fontSize: "0.85rem", padding: "0.25rem 0.5rem", borderRadius: 4, border: "1px solid #d1d5db" }}
          >
            <option value="">All milestones</option>
            {REPORT_MILESTONES.map((t) => (
              <option key={t} value={t}>{t}%</option>
            ))}
          </select>

          {/* Export */}
          <button
            onClick={handleExport}
            aria-label="Export milestone report as CSV"
            data-testid="report-export-btn"
            disabled={sorted.length === 0 || isLoading}
            style={{
              padding: "0.35rem 0.9rem",
              background: "#111827",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: sorted.length === 0 || isLoading ? "not-allowed" : "pointer",
              fontSize: "0.85rem",
              minWidth: 44,
              minHeight: 44,
              opacity: sorted.length === 0 || isLoading ? 0.5 : 1,
            }}
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Summary badges ── */}
      {!isLoading && entries.length > 0 && (
        <div
          data-testid="reports-summary"
          style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}
        >
          {REPORT_MILESTONES.map((t) => {
            const hit = entries.find((e) => e.threshold === t);
            return (
              <span
                key={t}
                data-testid={`summary-badge-${t}`}
                style={{
                  padding: "0.2rem 0.6rem",
                  borderRadius: 12,
                  fontSize: "0.75rem",
                  background: hit ? SEVERITY_COLORS[hit.severity] : "#e5e7eb",
                  color: hit ? "#fff" : "#9ca3af",
                  fontWeight: 600,
                }}
              >
                {t}% {hit ? "✓" : "—"}
              </span>
            );
          })}
        </div>
      )}

      {/* ── Table ── */}
      <ReportTable
        entries={sorted}
        isLoading={isLoading}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        filterThreshold={filterThreshold}
      />
    </section>
  );
};

export default MilestoneReports;
