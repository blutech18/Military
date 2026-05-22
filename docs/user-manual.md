# User Manual — ArmoryDB

> Audience: Personnel, Armory Custodians, S4 Officers, Command Officers, Administrators of the 10th RCDG.

## 1. Logging In

1. Open `https://armory.10rcdg.local` in your browser.
2. Enter your **username** and **password**, then click **Continue → MFA**.
3. **First-time only:** scan the QR code shown on screen with **Google Authenticator**, then type the 6-digit code.
4. Place your **enrolled finger** on the Futronic scanner. The system verifies and signs you in.

After **3 failed password attempts**, a reCAPTCHA challenge appears.
Sessions automatically expire after **15 minutes of inactivity**.

## 2. Navigating the Dashboard

The left navigation reveals only the modules your role can access.

| Section | What you can do |
|---|---|
| **Command Dashboard** | KPIs, live tactical map, recent transactions, audit feed |
| **Firearms** | Browse / register / open firearm records with QR |
| **QR Scanner** | Use the device camera to identify a firearm in seconds |
| **Transactions** | Issue and return firearms with role-controlled approval |
| **GPS Tracking** | Full-screen tactical map with real-time positions |
| **Maintenance** | Log inspections, repairs, and cleaning |
| **Notifications** | Overdue, geofence, suspicious-activity alerts |
| **Audit Trail** | Append-only system log (clearance ≥ Secret) |
| **Users** | Manage personnel (Administrator only) |
| **Reports** | Inventory, transactions, audit, maintenance, GPS history (PDF / CSV) |

## 3. Issuing a Firearm (S4 / Custodian)

1. Click **Transactions → New Issuance** *(or)* scan a QR first to pre-select the firearm.
2. Choose the **firearm**, **personnel**, **expected return date**, **purpose**, and **condition on issue**.
3. Click **Authorize Issuance**.
4. The system flips the firearm to *Checked Out*, activates GPS tracking, and writes an audit log.

## 4. Returning a Firearm

1. Open **Transactions** (or scan QR).
2. Click **Return** on the active row.
3. Select the **condition on return**. If condition ≥ Fair the firearm becomes *Maintenance*.

## 5. Generating Reports

1. Open **Reports**.
2. Click **PDF** or **CSV** for the report you need.
3. The file downloads with the current session signed-in.

## 6. Tactical Map

- Markers pulse green for normal status, red for Overdue.
- Dashed circles show **geofences**: white = armory, amber = restricted, blue = standard.
- Click any marker to see firearm, personnel, battery, and last-update time.
- The map auto-refreshes every **30 seconds**.

## 7. Changing Your Password / TOTP

Open **Profile** (top-right username) and use the change-credential flows. After a password reset you may be prompted to re-enroll TOTP and biometric template.

## 8. Reporting an Incident

If you observe an unauthorized access or suspect tampering:

1. Open the firearm record and click **History**.
2. Capture the firearm serial, transaction ID, last GPS coordinate, and screenshot.
3. Email or escalate to the duty officer immediately.

The system already logs every action and signal of the device — these records are immutable.

## 9. Quick Tips

- Keep the camera lens clean for ≥ 98 % QR-scan success.
- Place fingertip flat and dry on the Futronic scanner.
- Allow the GPS device 1–2 minutes outdoors for the first fix on a cold start.
- Use **Sweep Overdue** in Transactions to manually trigger overdue flagging.

## 10. Support

For software bugs, contact the system administrator. For hardware (GPS/biometric) faults, raise a ticket through the S4 office.
