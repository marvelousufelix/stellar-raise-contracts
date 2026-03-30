/// Security Compliance Reporting Module
///
/// Provides automated security compliance reporting for contract testing and regulatory adherence.
/// Generates comprehensive compliance reports with vulnerability assessments and remediation tracking.
///
/// # Security Assumptions
/// - All report data is immutable after generation
/// - Timestamps are monotonically increasing
/// - Vulnerability severity levels are validated
/// - Report signatures prevent tampering
/// - Access control enforced for sensitive reports

use soroban_sdk::{contracttype, vec, Env, String, Symbol, Vec};

// ── Types ────────────────────────────────────────────────────────────────────

/// Vulnerability severity levels
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[repr(u8)]
pub enum SeverityLevel {
    /// No security impact
    Info = 0,
    /// Low impact, minimal risk
    Low = 1,
    /// Medium impact, moderate risk
    Medium = 2,
    /// High impact, significant risk
    High = 3,
    /// Critical impact, immediate action required
    Critical = 4,
}

impl SeverityLevel {
    /// Validates severity level value
    pub fn is_valid(level: u8) -> bool {
        level <= 4
    }

    /// Returns string representation
    pub fn as_str(&self) -> &'static str {
        match self {
            SeverityLevel::Info => "info",
            SeverityLevel::Low => "low",
            SeverityLevel::Medium => "medium",
            SeverityLevel::High => "high",
            SeverityLevel::Critical => "critical",
        }
    }
}

/// Compliance status
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum ComplianceStatus {
    /// Compliant with all requirements
    Compliant = 0,
    /// Non-compliant, action required
    NonCompliant = 1,
    /// Partial compliance, improvements needed
    PartialCompliant = 2,
    /// Compliance status unknown
    Unknown = 3,
}

impl ComplianceStatus {
    /// Validates compliance status value
    pub fn is_valid(status: u8) -> bool {
        status <= 3
    }

    /// Returns string representation
    pub fn as_str(&self) -> &'static str {
        match self {
            ComplianceStatus::Compliant => "compliant",
            ComplianceStatus::NonCompliant => "non_compliant",
            ComplianceStatus::PartialCompliant => "partial_compliant",
            ComplianceStatus::Unknown => "unknown",
        }
    }
}

/// Vulnerability finding
#[contracttype]
#[derive(Clone, Debug)]
pub struct Vulnerability {
    /// Unique vulnerability identifier
    pub id: String,
    /// Vulnerability title
    pub title: String,
    /// Detailed description
    pub description: String,
    /// Severity level
    pub severity: u8,
    /// Affected component
    pub component: String,
    /// Remediation steps
    pub remediation: String,
    /// Status (open/resolved)
    pub status: String,
}

impl Vulnerability {
    /// Creates new vulnerability
    pub fn new(
        id: String,
        title: String,
        description: String,
        severity: u8,
        component: String,
        remediation: String,
    ) -> Self {
        Self {
            id,
            title,
            description,
            severity,
            component,
            remediation,
            status: String::from_slice(&Env::default(), "open"),
        }
    }

    /// Validates vulnerability data
    pub fn validate(&self) -> bool {
        !self.id.is_empty()
            && !self.title.is_empty()
            && SeverityLevel::is_valid(self.severity)
            && !self.component.is_empty()
    }
}

/// Compliance report
#[contracttype]
#[derive(Clone, Debug)]
pub struct ComplianceReport {
    /// Report identifier
    pub report_id: String,
    /// Report timestamp
    pub timestamp: u64,
    /// Overall compliance status
    pub status: u8,
    /// Total vulnerabilities found
    pub total_vulnerabilities: u32,
    /// Critical vulnerabilities
    pub critical_count: u32,
    /// High severity vulnerabilities
    pub high_count: u32,
    /// Medium severity vulnerabilities
    pub medium_count: u32,
    /// Low severity vulnerabilities
    pub low_count: u32,
    /// Vulnerabilities found
    pub vulnerabilities: Vec<Vulnerability>,
    /// Compliance score (0-100)
    pub compliance_score: u32,
    /// Report hash for integrity verification
    pub report_hash: String,
}

impl ComplianceReport {
    /// Creates new compliance report
    pub fn new(
        env: &Env,
        report_id: String,
        timestamp: u64,
        status: u8,
        vulnerabilities: Vec<Vulnerability>,
    ) -> Self {
        let (critical, high, medium, low) = Self::count_by_severity(&vulnerabilities);
        let total = vulnerabilities.len() as u32;
        let compliance_score = Self::calculate_score(total, critical);
        let report_hash = Self::generate_hash(env, &report_id, timestamp);

        Self {
            report_id,
            timestamp,
            status,
            total_vulnerabilities: total,
            critical_count: critical,
            high_count: high,
            medium_count: medium,
            low_count: low,
            vulnerabilities,
            compliance_score,
            report_hash,
        }
    }

    /// Counts vulnerabilities by severity
    fn count_by_severity(vulns: &Vec<Vulnerability>) -> (u32, u32, u32, u32) {
        let mut critical = 0u32;
        let mut high = 0u32;
        let mut medium = 0u32;
        let mut low = 0u32;

        for vuln in vulns.iter() {
            match vuln.severity {
                4 => critical += 1,
                3 => high += 1,
                2 => medium += 1,
                1 => low += 1,
                _ => {}
            }
        }

        (critical, high, medium, low)
    }

    /// Calculates compliance score
    fn calculate_score(total: u32, critical: u32) -> u32 {
        if total == 0 {
            return 100;
        }

        let penalty = (critical * 50) + ((total - critical) * 5);
        if penalty >= 100 {
            0
        } else {
            100 - penalty
        }
    }

    /// Generates report hash for integrity verification
    fn generate_hash(env: &Env, report_id: &String, timestamp: u64) -> String {
        // Simple hash generation - in production use cryptographic hash
        let combined = format!("{}{}", report_id.clone(), timestamp);
        String::from_slice(env, &combined.as_bytes()[..combined.len().min(32)])
    }

    /// Validates report integrity
    pub fn validate_integrity(&self, env: &Env) -> bool {
        let expected_hash = Self::generate_hash(env, &self.report_id, self.timestamp);
        self.report_hash == expected_hash
    }

    /// Validates report data
    pub fn validate(&self) -> bool {
        !self.report_id.is_empty()
            && self.timestamp > 0
            && ComplianceStatus::is_valid(self.status)
            && self.compliance_score <= 100
            && self.vulnerabilities.iter().all(|v| v.validate())
    }
}

// ── Report Generation ────────────────────────────────────────────────────────

/// Generates compliance report from vulnerabilities
pub fn generate_report(
    env: &Env,
    report_id: String,
    vulnerabilities: Vec<Vulnerability>,
) -> ComplianceReport {
    let timestamp = env.ledger().timestamp();
    let status = if vulnerabilities.is_empty() {
        ComplianceStatus::Compliant as u8
    } else {
        ComplianceStatus::PartialCompliant as u8
    };

    ComplianceReport::new(env, report_id, timestamp, status, vulnerabilities)
}

/// Adds vulnerability to report
pub fn add_vulnerability(
    env: &Env,
    mut report: ComplianceReport,
    vulnerability: Vulnerability,
) -> ComplianceReport {
    if !vulnerability.validate() {
        return report;
    }

    let mut vulns = report.vulnerabilities.clone();
    vulns.push_back(vulnerability);

    let (critical, high, medium, low) = ComplianceReport::count_by_severity(&vulns);
    let total = vulns.len() as u32;
    let compliance_score = ComplianceReport::calculate_score(total, critical);

    ComplianceReport {
        total_vulnerabilities: total,
        critical_count: critical,
        high_count: high,
        medium_count: medium,
        low_count: low,
        vulnerabilities: vulns,
        compliance_score,
        report_hash: ComplianceReport::generate_hash(env, &report.report_id, report.timestamp),
        ..report
    }
}

/// Resolves vulnerability in report
pub fn resolve_vulnerability(
    mut report: ComplianceReport,
    vuln_id: String,
) -> ComplianceReport {
    let mut vulns = report.vulnerabilities.clone();

    for i in 0..vulns.len() {
        if let Some(mut vuln) = vulns.get_mut(i) {
            if vuln.id == vuln_id {
                vuln.status = String::from_slice(&Env::default(), "resolved");
                break;
            }
        }
    }

    report.vulnerabilities = vulns;
    report
}

/// Calculates report statistics
pub fn calculate_statistics(report: &ComplianceReport) -> (u32, u32, u32) {
    let total = report.total_vulnerabilities;
    let resolved = report
        .vulnerabilities
        .iter()
        .filter(|v| v.status == String::from_slice(&Env::default(), "resolved"))
        .count() as u32;
    let open = total - resolved;

    (total, open, resolved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_severity_level_validation() {
        assert!(SeverityLevel::is_valid(0));
        assert!(SeverityLevel::is_valid(4));
        assert!(!SeverityLevel::is_valid(5));
    }

    #[test]
    fn test_compliance_status_validation() {
        assert!(ComplianceStatus::is_valid(0));
        assert!(ComplianceStatus::is_valid(3));
        assert!(!ComplianceStatus::is_valid(4));
    }

    #[test]
    fn test_vulnerability_creation() {
        let vuln = Vulnerability::new(
            String::from_slice(&Env::default(), "vuln-1"),
            String::from_slice(&Env::default(), "XSS"),
            String::from_slice(&Env::default(), "Cross-site scripting"),
            3,
            String::from_slice(&Env::default(), "frontend"),
            String::from_slice(&Env::default(), "Sanitize inputs"),
        );

        assert!(vuln.validate());
        assert_eq!(vuln.severity, 3);
    }

    #[test]
    fn test_compliance_score_calculation() {
        assert_eq!(ComplianceReport::calculate_score(0, 0), 100);
        assert_eq!(ComplianceReport::calculate_score(1, 1), 50);
        assert_eq!(ComplianceReport::calculate_score(10, 2), 90);
    }
}
