#[cfg(test)]
mod tests {
    use crate::security_compliance_reporting::*;
    use soroban_sdk::{vec, Env, String};

    fn create_test_env() -> Env {
        Env::default()
    }

    fn create_test_vulnerability(env: &Env, id: &str, severity: u8) -> Vulnerability {
        Vulnerability::new(
            String::from_slice(env, id),
            String::from_slice(env, "Test Vulnerability"),
            String::from_slice(env, "Test description"),
            severity,
            String::from_slice(env, "test-component"),
            String::from_slice(env, "Fix this issue"),
        )
    }

    // ── Severity Level Tests ─────────────────────────────────────────────────

    #[test]
    fn test_severity_level_info() {
        assert_eq!(SeverityLevel::Info as u8, 0);
        assert_eq!(SeverityLevel::Info.as_str(), "info");
    }

    #[test]
    fn test_severity_level_low() {
        assert_eq!(SeverityLevel::Low as u8, 1);
        assert_eq!(SeverityLevel::Low.as_str(), "low");
    }

    #[test]
    fn test_severity_level_medium() {
        assert_eq!(SeverityLevel::Medium as u8, 2);
        assert_eq!(SeverityLevel::Medium.as_str(), "medium");
    }

    #[test]
    fn test_severity_level_high() {
        assert_eq!(SeverityLevel::High as u8, 3);
        assert_eq!(SeverityLevel::High.as_str(), "high");
    }

    #[test]
    fn test_severity_level_critical() {
        assert_eq!(SeverityLevel::Critical as u8, 4);
        assert_eq!(SeverityLevel::Critical.as_str(), "critical");
    }

    #[test]
    fn test_severity_level_validation_valid() {
        assert!(SeverityLevel::is_valid(0));
        assert!(SeverityLevel::is_valid(1));
        assert!(SeverityLevel::is_valid(2));
        assert!(SeverityLevel::is_valid(3));
        assert!(SeverityLevel::is_valid(4));
    }

    #[test]
    fn test_severity_level_validation_invalid() {
        assert!(!SeverityLevel::is_valid(5));
        assert!(!SeverityLevel::is_valid(10));
        assert!(!SeverityLevel::is_valid(255));
    }

    // ── Compliance Status Tests ──────────────────────────────────────────────

    #[test]
    fn test_compliance_status_compliant() {
        assert_eq!(ComplianceStatus::Compliant as u8, 0);
        assert_eq!(ComplianceStatus::Compliant.as_str(), "compliant");
    }

    #[test]
    fn test_compliance_status_non_compliant() {
        assert_eq!(ComplianceStatus::NonCompliant as u8, 1);
        assert_eq!(ComplianceStatus::NonCompliant.as_str(), "non_compliant");
    }

    #[test]
    fn test_compliance_status_partial_compliant() {
        assert_eq!(ComplianceStatus::PartialCompliant as u8, 2);
        assert_eq!(ComplianceStatus::PartialCompliant.as_str(), "partial_compliant");
    }

    #[test]
    fn test_compliance_status_unknown() {
        assert_eq!(ComplianceStatus::Unknown as u8, 3);
        assert_eq!(ComplianceStatus::Unknown.as_str(), "unknown");
    }

    #[test]
    fn test_compliance_status_validation_valid() {
        assert!(ComplianceStatus::is_valid(0));
        assert!(ComplianceStatus::is_valid(1));
        assert!(ComplianceStatus::is_valid(2));
        assert!(ComplianceStatus::is_valid(3));
    }

    #[test]
    fn test_compliance_status_validation_invalid() {
        assert!(!ComplianceStatus::is_valid(4));
        assert!(!ComplianceStatus::is_valid(10));
        assert!(!ComplianceStatus::is_valid(255));
    }

    // ── Vulnerability Tests ──────────────────────────────────────────────────

    #[test]
    fn test_vulnerability_creation() {
        let env = create_test_env();
        let vuln = create_test_vulnerability(&env, "vuln-1", 3);

        assert_eq!(vuln.id, String::from_slice(&env, "vuln-1"));
        assert_eq!(vuln.severity, 3);
        assert_eq!(vuln.status, String::from_slice(&env, "open"));
    }

    #[test]
    fn test_vulnerability_validation_valid() {
        let env = create_test_env();
        let vuln = create_test_vulnerability(&env, "vuln-1", 2);
        assert!(vuln.validate());
    }

    #[test]
    fn test_vulnerability_validation_invalid_empty_id() {
        let env = create_test_env();
        let mut vuln = create_test_vulnerability(&env, "vuln-1", 2);
        vuln.id = String::from_slice(&env, "");
        assert!(!vuln.validate());
    }

    #[test]
    fn test_vulnerability_validation_invalid_severity() {
        let env = create_test_env();
        let mut vuln = create_test_vulnerability(&env, "vuln-1", 2);
        vuln.severity = 10;
        assert!(!vuln.validate());
    }

    #[test]
    fn test_vulnerability_all_severity_levels() {
        let env = create_test_env();

        for severity in 0..=4 {
            let vuln = create_test_vulnerability(&env, "vuln", severity);
            assert!(vuln.validate());
        }
    }

    // ── Compliance Report Tests ──────────────────────────────────────────────

    #[test]
    fn test_compliance_report_creation_empty() {
        let env = create_test_env();
        let vulns = vec![&env];
        let report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::Compliant as u8,
            vulns,
        );

        assert_eq!(report.total_vulnerabilities, 0);
        assert_eq!(report.critical_count, 0);
        assert_eq!(report.compliance_score, 100);
    }

    #[test]
    fn test_compliance_report_creation_with_vulnerabilities() {
        let env = create_test_env();
        let mut vulns = vec![&env];
        vulns.push_back(create_test_vulnerability(&env, "vuln-1", 4)); // critical
        vulns.push_back(create_test_vulnerability(&env, "vuln-2", 3)); // high
        vulns.push_back(create_test_vulnerability(&env, "vuln-3", 2)); // medium

        let report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::PartialCompliant as u8,
            vulns,
        );

        assert_eq!(report.total_vulnerabilities, 3);
        assert_eq!(report.critical_count, 1);
        assert_eq!(report.high_count, 1);
        assert_eq!(report.medium_count, 1);
        assert_eq!(report.low_count, 0);
    }

    #[test]
    fn test_compliance_report_validation_valid() {
        let env = create_test_env();
        let vulns = vec![&env];
        let report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::Compliant as u8,
            vulns,
        );

        assert!(report.validate());
    }

    #[test]
    fn test_compliance_report_validation_invalid_empty_id() {
        let env = create_test_env();
        let vulns = vec![&env];
        let mut report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::Compliant as u8,
            vulns,
        );
        report.report_id = String::from_slice(&env, "");

        assert!(!report.validate());
    }

    #[test]
    fn test_compliance_report_validation_invalid_timestamp() {
        let env = create_test_env();
        let vulns = vec![&env];
        let mut report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::Compliant as u8,
            vulns,
        );
        report.timestamp = 0;

        assert!(!report.validate());
    }

    #[test]
    fn test_compliance_report_validation_invalid_status() {
        let env = create_test_env();
        let vulns = vec![&env];
        let mut report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::Compliant as u8,
            vulns,
        );
        report.status = 10;

        assert!(!report.validate());
    }

    #[test]
    fn test_compliance_report_validation_invalid_score() {
        let env = create_test_env();
        let vulns = vec![&env];
        let mut report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::Compliant as u8,
            vulns,
        );
        report.compliance_score = 101;

        assert!(!report.validate());
    }

    // ── Compliance Score Tests ───────────────────────────────────────────────

    #[test]
    fn test_compliance_score_no_vulnerabilities() {
        assert_eq!(ComplianceReport::calculate_score(0, 0), 100);
    }

    #[test]
    fn test_compliance_score_one_critical() {
        assert_eq!(ComplianceReport::calculate_score(1, 1), 50);
    }

    #[test]
    fn test_compliance_score_multiple_vulnerabilities() {
        assert_eq!(ComplianceReport::calculate_score(10, 2), 90);
    }

    #[test]
    fn test_compliance_score_all_critical() {
        assert_eq!(ComplianceReport::calculate_score(5, 5), 0);
    }

    #[test]
    fn test_compliance_score_mixed() {
        // 1 critical (50 penalty) + 3 non-critical (15 penalty) = 65 penalty
        assert_eq!(ComplianceReport::calculate_score(4, 1), 35);
    }

    // ── Report Generation Tests ──────────────────────────────────────────────

    #[test]
    fn test_generate_report_empty() {
        let env = create_test_env();
        let vulns = vec![&env];
        let report = generate_report(&env, String::from_slice(&env, "report-1"), vulns);

        assert_eq!(report.status, ComplianceStatus::Compliant as u8);
        assert_eq!(report.total_vulnerabilities, 0);
    }

    #[test]
    fn test_generate_report_with_vulnerabilities() {
        let env = create_test_env();
        let mut vulns = vec![&env];
        vulns.push_back(create_test_vulnerability(&env, "vuln-1", 3));

        let report = generate_report(&env, String::from_slice(&env, "report-1"), vulns);

        assert_eq!(report.status, ComplianceStatus::PartialCompliant as u8);
        assert_eq!(report.total_vulnerabilities, 1);
    }

    // ── Add Vulnerability Tests ──────────────────────────────────────────────

    #[test]
    fn test_add_vulnerability_valid() {
        let env = create_test_env();
        let vulns = vec![&env];
        let mut report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::Compliant as u8,
            vulns,
        );

        let new_vuln = create_test_vulnerability(&env, "vuln-1", 3);
        report = add_vulnerability(&env, report, new_vuln);

        assert_eq!(report.total_vulnerabilities, 1);
        assert_eq!(report.high_count, 1);
    }

    #[test]
    fn test_add_vulnerability_invalid() {
        let env = create_test_env();
        let vulns = vec![&env];
        let report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::Compliant as u8,
            vulns,
        );

        let mut invalid_vuln = create_test_vulnerability(&env, "vuln-1", 3);
        invalid_vuln.id = String::from_slice(&env, "");

        let updated_report = add_vulnerability(&env, report.clone(), invalid_vuln);

        assert_eq!(updated_report.total_vulnerabilities, report.total_vulnerabilities);
    }

    #[test]
    fn test_add_multiple_vulnerabilities() {
        let env = create_test_env();
        let vulns = vec![&env];
        let mut report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::Compliant as u8,
            vulns,
        );

        for i in 0..5 {
            let vuln = create_test_vulnerability(&env, &format!("vuln-{}", i), 2);
            report = add_vulnerability(&env, report, vuln);
        }

        assert_eq!(report.total_vulnerabilities, 5);
        assert_eq!(report.medium_count, 5);
    }

    // ── Resolve Vulnerability Tests ──────────────────────────────────────────

    #[test]
    fn test_resolve_vulnerability() {
        let env = create_test_env();
        let mut vulns = vec![&env];
        vulns.push_back(create_test_vulnerability(&env, "vuln-1", 3));

        let mut report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::PartialCompliant as u8,
            vulns,
        );

        report = resolve_vulnerability(report, String::from_slice(&env, "vuln-1"));

        assert_eq!(
            report.vulnerabilities.get(0).unwrap().status,
            String::from_slice(&env, "resolved")
        );
    }

    #[test]
    fn test_resolve_nonexistent_vulnerability() {
        let env = create_test_env();
        let mut vulns = vec![&env];
        vulns.push_back(create_test_vulnerability(&env, "vuln-1", 3));

        let report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::PartialCompliant as u8,
            vulns,
        );

        let updated_report = resolve_vulnerability(report.clone(), String::from_slice(&env, "vuln-999"));

        assert_eq!(
            updated_report.vulnerabilities.get(0).unwrap().status,
            String::from_slice(&env, "open")
        );
    }

    // ── Statistics Tests ─────────────────────────────────────────────────────

    #[test]
    fn test_calculate_statistics_empty() {
        let env = create_test_env();
        let vulns = vec![&env];
        let report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::Compliant as u8,
            vulns,
        );

        let (total, open, resolved) = calculate_statistics(&report);
        assert_eq!(total, 0);
        assert_eq!(open, 0);
        assert_eq!(resolved, 0);
    }

    #[test]
    fn test_calculate_statistics_all_open() {
        let env = create_test_env();
        let mut vulns = vec![&env];
        vulns.push_back(create_test_vulnerability(&env, "vuln-1", 3));
        vulns.push_back(create_test_vulnerability(&env, "vuln-2", 2));

        let report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::PartialCompliant as u8,
            vulns,
        );

        let (total, open, resolved) = calculate_statistics(&report);
        assert_eq!(total, 2);
        assert_eq!(open, 2);
        assert_eq!(resolved, 0);
    }

    #[test]
    fn test_calculate_statistics_mixed() {
        let env = create_test_env();
        let mut vulns = vec![&env];
        vulns.push_back(create_test_vulnerability(&env, "vuln-1", 3));
        vulns.push_back(create_test_vulnerability(&env, "vuln-2", 2));

        let mut report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::PartialCompliant as u8,
            vulns,
        );

        report = resolve_vulnerability(report, String::from_slice(&env, "vuln-1"));

        let (total, open, resolved) = calculate_statistics(&report);
        assert_eq!(total, 2);
        assert_eq!(open, 1);
        assert_eq!(resolved, 1);
    }

    // ── Integrity Tests ──────────────────────────────────────────────────────

    #[test]
    fn test_report_integrity_valid() {
        let env = create_test_env();
        let vulns = vec![&env];
        let report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::Compliant as u8,
            vulns,
        );

        assert!(report.validate_integrity(&env));
    }

    #[test]
    fn test_report_integrity_tampered() {
        let env = create_test_env();
        let vulns = vec![&env];
        let mut report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::Compliant as u8,
            vulns,
        );

        report.report_hash = String::from_slice(&env, "tampered-hash");
        assert!(!report.validate_integrity(&env));
    }

    // ── Edge Cases ───────────────────────────────────────────────────────────

    #[test]
    fn test_large_vulnerability_count() {
        let env = create_test_env();
        let mut vulns = vec![&env];

        for i in 0..100 {
            vulns.push_back(create_test_vulnerability(&env, &format!("vuln-{}", i), 1));
        }

        let report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::PartialCompliant as u8,
            vulns,
        );

        assert_eq!(report.total_vulnerabilities, 100);
        assert_eq!(report.low_count, 100);
    }

    #[test]
    fn test_mixed_severity_distribution() {
        let env = create_test_env();
        let mut vulns = vec![&env];

        for _ in 0..2 {
            vulns.push_back(create_test_vulnerability(&env, "critical", 4));
        }
        for _ in 0..3 {
            vulns.push_back(create_test_vulnerability(&env, "high", 3));
        }
        for _ in 0..5 {
            vulns.push_back(create_test_vulnerability(&env, "medium", 2));
        }
        for _ in 0..10 {
            vulns.push_back(create_test_vulnerability(&env, "low", 1));
        }

        let report = ComplianceReport::new(
            &env,
            String::from_slice(&env, "report-1"),
            1000,
            ComplianceStatus::PartialCompliant as u8,
            vulns,
        );

        assert_eq!(report.critical_count, 2);
        assert_eq!(report.high_count, 3);
        assert_eq!(report.medium_count, 5);
        assert_eq!(report.low_count, 10);
    }
}
