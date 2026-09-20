# System Gap Findings and Implementation Notes

## Purpose

This note separates the capstone manuscript's formal system requirements from optional or unsupported implementation claims. The original manuscript is not modified. This file is the implementation guide for the current Laravel and Next.js project.

## Formal requirements taken from the manuscript

The project's stated objectives and scope require the system to provide:

1. GPS location tracking integrated with QR-based firearm identification.
2. A centralized web dashboard showing firearm location, issue/return activity, and status.
3. Password, biometric fingerprint, role, and clearance-based access controls.
4. A relational database for firearms, users, issue/return records, GPS logs, and maintenance.
5. An automated audit trail for check-in, check-out, access attempts, and system transactions.
6. QR-assisted issue and return workflows.
7. Alerts for overdue returns, access anomalies, and configurable security events.
8. Inventory, transaction, GPS, maintenance, personnel-assignment, audit, and security reporting.
9. Controlled prototype evaluation using simulated and/or live GPS data.

## Verified implementation baseline

The repository already implements the main web system through a Next.js/React/TypeScript frontend and Laravel REST API. Existing capabilities include firearm inventory, QR generation and lookup, issue/return transactions, GPS ingestion, live/history maps, circular geofences, overdue and maintenance scheduling, notifications, role-aware dashboards, reports, Sanctum authentication, TOTP primitives, biometric-template enrollment/comparison, and centralized audit logging.

Successful QR lookups are recorded as `qr_scan` audit events. Successful and failed biometric verification attempts are also represented in the centralized audit log; dedicated QR-scan and biometric-attempt tables are not required by the formal objectives.

## Feasible current-system fixes authorized for implementation

The following gaps fit the existing architecture and should be addressed directly in the project:

### Authentication and session security

- Make the cached MFA challenge authoritative and prevent token issuance until every required factor is complete.
- Preserve a fixed challenge expiry and consume the challenge after successful finalization.
- Verify Google reCAPTCHA v3 tokens server-side after the failed-login threshold instead of accepting any non-empty value.
- Permit demonstration reCAPTCHA and biometric placeholders only in explicit local/testing demo mode.
- Stop automatic fallback to a deterministic biometric template when the scanner bridge is unavailable in normal mode.
- Require a fresh, challenge-bound HMAC attestation from the trusted scanner bridge for every live fingerprint capture.
- Mark frontend authentication cookies `Secure` on HTTPS.
- Retry only safe/idempotent HTTP methods after transient API failures.

### Backend authorization

- Restrict Personnel transaction reads to their own records.
- Restrict Personnel firearm reads and QR lookup to currently assigned firearms.
- Restrict Personnel global search to their own assignments and transactions and do not expose other users.
- Restrict GPS live/history endpoints and reports to operational staff roles.
- Require at least Secret clearance for audit and security-incident reports.
- Correct the audit-route description so clearance level 2 is described as Secret-or-higher, not Top Secret-only.

### GPS integrity and alert handling

- Reject stale and unreasonably future GPS timestamps.
- Verify that a supplied transaction belongs to the submitted firearm, is Active or Overdue, and has GPS tracking enabled.
- Associate omitted transaction IDs only with a valid current tracked transaction.
- Reject duplicate or out-of-order telemetry for a device/equipment pair.
- Add a database uniqueness backstop for exact device/timestamp replay, with a non-destructive duplicate-data preflight before creating the index.
- Generate one geofence notification for an initial outside fix or an inside-to-outside transition, while suppressing repeated outside points.
- Remove the fallback to user ID 1 and notify the validated transaction authorizer.

### Automated security checks

- Run Composer dependency auditing in backend CI.
- Run high-severity npm dependency auditing in frontend CI.
- Add targeted backend feature tests for changed authentication, ownership, report, and GPS behavior.

## Implementation status — September 13, 2026

All feasible current-system fixes listed above have been implemented in the Laravel/Next.js application. Regression coverage now exercises MFA challenge enforcement, reCAPTCHA action/score/hostname and outage handling, challenge-bound biometric bridge attestation, Personnel ownership boundaries, unknown-role denial, report role/clearance checks, signed GPS ingestion, timestamp/order conflicts, migration duplicate preflight, and geofence alert deduplication.

Dependency audits initially identified inherited vulnerable versions. Non-breaking dependency refreshes were applied first, followed by validated framework security upgrades to Laravel 12 and Next.js 16 because the remaining advisories had no fixes on the previous major versions. `composer audit --no-interaction` and `npm audit --audit-level=high` are enforced in CI and currently report no known advisories. ESLint 9 flat configuration is also enforced in CI; existing frontend type/purity cleanup remains visible as non-blocking warnings so it can be addressed incrementally without hiding the debt.

These code changes do not prove physical-device integration, production infrastructure security, backup restoration, or the manuscript's quantitative field-performance targets; those remain external verification work.

## Manuscript claims that do not define required implementation

The following items are outside the formal objectives/scope or are optional implementation details. They should not drive unsafe assumptions in the software.

### Rank-based firearm limits

The manuscript explicitly states:

> “Within the proposed system, firearm access restrictions will be implemented based on the soldier’s rank and role, limiting the number and type of firearms they can acquire at any given time.”

**Reference:** Chapter 1, **The Problem and Its Scope**, background discussion on manuscript page 3 (`REAL-TIME GLOBAL POSITIONING SYSTEM-BASED FIREARM TRACKING AND MANAGEMENT SYSTEM.md`, currently around Markdown source line 58).

This sentence is evidence that rank-based firearm quantity/type restrictions are mentioned in the manuscript narrative. However, the formal objectives specify role- and clearance-based access, and the manuscript does not define the actual rank-to-firearm rules—for example, which ranks may acquire which firearm types, permitted quantities, exceptions, or approval escalation. The system therefore implements the defined role and clearance controls but does not invent a military rank policy. Rank-based quantity/type enforcement requires an agency-approved authorization matrix before implementation.

### CSV inventory import

CSV seeding is mentioned in the IPO/design narrative but not required by the objectives or scope. Existing validated registration and PHP seeders satisfy database initialization for the prototype. CSV import can be added later if the agency provides an approved schema and error-handling rules.

### Native Android application and mobile GPS

The delimitation says a mobile client is optional and Android-only if used. A native Android app is not required. The current responsive web application can run in a compatible Android browser. The formal scope allows GPS from a device or module, so browser/mobile geolocation collection is also not required.

### Named tracker firmware and hardware

The manuscript names Arduino Nano, ESP32, GY-NEO6MV2, and Futronic devices, but the controlled prototype scope permits simulated and/or live GPS data. Firmware, wiring, power management, tamper resistance, and scanner-bridge deployment require separate hardware deliverables and cannot be safely fabricated inside the web repository.

### Machine-learning predictive maintenance

Machine learning appears in the related-literature discussion, not in the formal objectives or scope. The current system implements preventive maintenance schedules and due-date alerts. No machine-learning implementation is required. Any system description should use `preventive maintenance scheduling`, not claim predictive ML.

### Unexpected-movement detection

A separate anomaly-detection model is not required. The current geofence implementation provides a deterministic location-deviation alert. More advanced movement rules require approved thresholds and operational definitions.

### Database-level audit immutability

The formal objective requires an automated audit trail, which is implemented. The model blocks standard application updates and deletes. Database triggers, append-only database roles, cryptographic hash chains, or external anchoring are defense-in-depth options, not formal requirements, and require production database policy.

### Field-level encryption of GPS coordinates and serial numbers

The manuscript claims encryption in narrative sections, but field-level encryption is not specified in the formal scope. Passwords are hashed, and TOTP/biometric values use encrypted casts. Encrypting searchable serials and geospatial coordinates requires a migration, key-rotation plan, backup design, and searchable/blind-index strategy. It should not be introduced without an approved data-protection design. Production database/disk encryption remains a deployment responsibility.

### Quantitative GPS and QR targets

The 98% QR success, five-second GPS latency at 95% reliability, and ten-meter accuracy for 90% of updates are acceptance targets, not implementation features or proven results. The application stores timestamps and accuracy values, but achieving the percentages requires a controlled measurement protocol and field-test evidence.

### Vulnerability, hardware, backup, and deployment evidence

Vulnerability scans are additional security evidence rather than a formal feature. Hardware integration tests are required only when claiming completed physical-device integration. Backup restoration testing is a production best practice but is not a stated capstone requirement. Production deployment at the 10th RCDG is not required by the design/development objectives; it must not be assumed from repository code alone.

## Deferred decisions requiring external input

The following changes are intentionally deferred until policy, hardware, or deployment information is available:

- Rank-to-firearm type and quantity authorization rules.
- Native Android packaging or mobile geolocation collection.
- Arduino/ESP32/GPS firmware and Futronic SDK bridge implementation.
- Machine-learning predictive maintenance.
- Field-level encryption and key management for searchable operational data.
- Database triggers or cryptographic audit anchoring.
- Per-device IoT credentials, secure provisioning, and hardware tamper controls.
- Production infrastructure, firewall, backup, restore, queue-worker, scheduler, and SSE process verification.
- Empirical QR, GPS accuracy, latency, battery, biometric FAR/FRR, and hardware test results.

## Security boundary

Frontend route visibility is a usability control, not an authorization boundary. Sensitive access must always be enforced by Laravel middleware and controller query scoping. Demonstration modes must be explicitly enabled, limited to local/testing environments, and rejected by the production backend.
