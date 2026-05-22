# Software Requirements Specification (SRS)
## Real-Time GPS-Based Firearm Tracking and Management System

**Version:** 2.0
**Date:** December 2025
**Prepared for:** 10th Regional Community Defense Group (10RCDG), Reserve Command, Philippine Army
**Prepared by:** Charlmaigne Anntonee N. Aure · Marc Steven U. Manoop

---

## 1. Introduction

### 1.1 Purpose
This SRS describes the functional and non-functional requirements of the Real-Time GPS-Based Firearm Tracking and Management System (hereafter "the System") commissioned to modernize armory operations of the 10th RCDG.

### 1.2 Scope
The System is a secure, web-based, IoT-enabled platform that:
- Tracks issued firearms in real-time via GPS
- Identifies firearms via QR codes
- Authenticates personnel using biometric fingerprints + TOTP
- Maintains an immutable audit trail of all firearm activity
- Generates inventory, transaction, and audit reports

### 1.3 Definitions
| Term | Definition |
|---|---|
| 10RCDG | 10th Regional Community Defense Group |
| ArmoryDB | Centralized relational database |
| GPS | Global Positioning System |
| QR | Quick Response (2D matrix barcode) |
| MFA | Multi-Factor Authentication |
| TOTP | Time-based One-Time Password |
| RBAC | Role-Based Access Control |
| OWASP | Open Web Application Security Project |

---

## 2. Overall Description

### 2.1 Product Perspective
A standalone, three-tier web application:

- **Presentation:** Next.js 14 (App Router) + Tailwind + ShadCN UI
- **Business Logic:** Laravel 11 REST API
- **Data:** MariaDB/MySQL (`ArmoryDB`)

External hardware: ESP32 + GY-NEO6MV2 (GPS), Futronic FS80H/FS88H (fingerprint).

### 2.2 User Classes
| Role | Description |
|---|---|
| Administrator | Full system control: users, roles, system settings |
| Command Officer | View-all dashboards, reports, no edit on inventory |
| S4 Officer | Approve/record issuance & return, manage stocks |
| Armory Custodian | Day-to-day firearm tag/issue/return; QR scan |
| Personnel | Authenticate, view assigned firearm, return |

### 2.3 Operating Environment
- Server: Linux (Ubuntu 22.04 LTS) + Caddy/Nginx + PHP-FPM
- Client: Modern browsers (Chromium 110+, Firefox 110+, Safari 16+) on desktop, tablet, Android
- Network: HTTPS only, TLS 1.3

---

## 3. Functional Requirements

### FR-1 Authentication
- FR-1.1 Username/password login with bcrypt(12)
- FR-1.2 Google Authenticator TOTP (6-digit, 30 s)
- FR-1.3 Biometric fingerprint capture & verify
- FR-1.4 Session expiry after 15 min idle
- FR-1.5 Google reCAPTCHA v3 after 3 failed attempts
- FR-1.6 Login audit (IP, timestamp, success/failure)
- FR-1.7 HttpOnly + Secure + SameSite=Strict cookies

### FR-2 Firearm Management
- FR-2.1 Register firearm (serial, model, manufacturer, category, condition)
- FR-2.2 Auto-generate unique QR encoding `{equipment_id, serial, category, status}`
- FR-2.3 Browser-camera QR scan with `html5-qrcode`
- FR-2.4 Track condition: Excellent / Good / Fair / Poor
- FR-2.5 Track availability: Available / Checked Out / Maintenance / Overdue

### FR-3 Real-Time GPS Tracking
- FR-3.1 ESP32 sends encrypted lat/lon every 30 s
- FR-3.2 Live Leaflet.js map with marker overlays
- FR-3.3 Geofencing (polygon zones around armory/training areas)
- FR-3.4 Route history visualization
- FR-3.5 GPS latency ≤ 5 s, accuracy ≤ 10 m at 90 % updates, ≥ 95 % reliability

### FR-4 Transactions (Issuance / Return)
- FR-4.1 Issuance workflow: login → password → fingerprint → TOTP → QR scan → authorize → record → start GPS
- FR-4.2 Return workflow: authenticate → QR scan → validate → record → stop GPS → inspect condition → log
- FR-4.3 Auto-flag overdue based on `expected_return_at`

### FR-5 Audit Trail
- FR-5.1 Append-only logs for: login, issuance, return, maintenance, GPS update, access denial, config change
- FR-5.2 Each entry: timestamp, user_id, action, description, ip_address, equipment_id, role
- FR-5.3 Standard users cannot edit/delete

### FR-6 Notifications & Alerts
- FR-6.1 Auto-alerts: overdue, unauthorized access, geofence violation, failed login, maintenance due, suspicious activity
- FR-6.2 Delivery: in-app toast, dashboard panel, email

### FR-7 Dashboard & Monitoring
- FR-7.1 Live GPS map
- FR-7.2 KPIs: active, issued, available, maintenance, overdue
- FR-7.3 Recent transactions, audit feed, alerts
- FR-7.4 Charts: status pie, condition bars, monthly transactions
- FR-7.5 Role-aware visibility, search, filter, export

### FR-8 Reports
- FR-8.1 Inventory, Issuance, GPS history, Personnel assignment, Maintenance, Audit, Security incident
- FR-8.2 Export PDF, CSV, Excel

---

## 4. Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-1 | QR scan success rate | ≥ 98 % |
| NFR-2 | GPS update cadence | 30 s |
| NFR-3 | GPS reliability | ≥ 95 % |
| NFR-4 | API response (P95) | ≤ 400 ms |
| NFR-5 | Dashboard first paint | ≤ 1.5 s |
| NFR-6 | Concurrent users | 100+ |
| NFR-7 | Availability | 99.5 % |
| NFR-8 | Backup | Daily encrypted |
| NFR-9 | WCAG | 2.1 AA |
| NFR-10 | TLS | 1.3 only |

---

## 5. Constraints

- DO NOT include: civilian asset tracking, combat analytics, ML predictions, smart-gun hardware, external military command integration
- ONLY focus on: GPS tracking, QR identification, biometric AuthN, centralized management, accountability, security, auditability

---

## 6. Acceptance Criteria

| # | Criterion |
|---|---|
| 1 | All 5 user roles can authenticate with password + TOTP + fingerprint |
| 2 | Firearm registered with QR generated and printable |
| 3 | Browser camera scans QR and retrieves firearm record < 2 s |
| 4 | ESP32 transmits encrypted GPS every 30 s; map updates within 5 s |
| 5 | Issuance workflow records transaction with full audit trail |
| 6 | Overdue alert fires within 1 min of `expected_return_at` |
| 7 | Reports export PDF/CSV/Excel without errors |
| 8 | Audit logs are immutable to standard users |
| 9 | Rate limiting blocks > 5 req/s |
| 10 | All sensitive fields encrypted at rest |
