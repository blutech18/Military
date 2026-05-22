# API Reference — `ArmoryDB v1`

Base URL: `http://127.0.0.1:8000/api/v1` (development) — replace with HTTPS host in production.

All authenticated endpoints require a Sanctum bearer token in the `Authorization` header.
All endpoints are protected by the strict **5 requests per second** rate limiter (per user + IP).

## 1. Authentication

| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| POST | `/auth/login`            | public  | `{username, password, recaptcha_token?}` → `{challenge_token, next}` |
| POST | `/auth/totp/setup`       | public  | `{challenge_token}` → `{secret, otpauth}` |
| POST | `/auth/totp/verify`      | public  | `{challenge_token, code}` |
| POST | `/auth/biometric/verify` | public  | `{challenge_token, fingerprint}` → `{token, user}` |
| GET  | `/auth/me`               | bearer  | current user profile |
| POST | `/auth/logout`           | bearer  | revoke current token |

## 2. Firearms

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET   | `/firearms`              | any auth | `?search=&availability_status=&condition_status=&per_page=` |
| GET   | `/firearms/{id}`         | any auth | with relationships |
| GET   | `/firearms/{id}/qr`      | any auth | returns `image/svg+xml` QR |
| POST  | `/firearms/lookup`       | any auth | `{qr_payload}` returns matching firearm |
| POST  | `/firearms`              | Admin / S4 / Custodian | register new firearm |
| PATCH | `/firearms/{id}`         | Admin / S4 / Custodian | partial update |
| DELETE| `/firearms/{id}`         | Admin / S4 / Custodian | soft delete |

## 3. Transactions

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET   | `/transactions`              | any auth | `?status=&user_id=&equipment_id=` |
| GET   | `/transactions/{id}`         | any auth | with GPS logs |
| POST  | `/transactions/issue`        | Admin / S4 / Custodian | issuance workflow |
| PATCH | `/transactions/{id}/return`  | Admin / S4 / Custodian | return workflow |
| POST  | `/transactions/sweep-overdue`| Admin / S4 / Custodian | scheduled-job endpoint |

## 4. GPS

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/gps/ingest` | **HMAC** (`X-Armory-Signature`) | from ESP32 |
| GET  | `/gps/live`   | bearer | latest fix per active firearm + geofences |
| GET  | `/gps/history/{equipmentId}` | bearer | `?from=&to=&limit=&transaction_id=` |

## 5. Maintenance

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET  | `/maintenance` | any auth | `?equipment_id=` |
| POST | `/maintenance` | Admin / S4 / Custodian | record service |

## 6. Notifications

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET   | `/notifications`            | bearer | paginate user's notifications |
| GET   | `/notifications/unread`     | bearer | count + 50 latest unread |
| PATCH | `/notifications/{id}/read`  | bearer | mark single as read |
| POST  | `/notifications/mark-all-read` | bearer | mark all as read |

## 7. Audit Logs (clearance ≥ Secret)

| Method | Path | Notes |
|---|---|---|
| GET | `/audit-logs`         | `?action=&user_id=&from=&to=` |
| GET | `/audit-logs/actions` | distinct list of audit actions |

## 8. Users (Administrator only)

| Method | Path | Notes |
|---|---|---|
| GET    | `/users`        | `?role=&only_active=&search=` |
| GET    | `/users/roles`  | role list |
| POST   | `/users`        | create |
| GET    | `/users/{id}`   | show |
| PATCH  | `/users/{id}`   | update |
| DELETE | `/users/{id}`   | soft-delete + deactivate |

## 9. Geofences / Locations

| Method | Path | Roles |
|---|---|---|
| GET    | `/locations`        | any auth |
| POST   | `/locations`        | Admin / S4 |
| PATCH  | `/locations/{id}`   | Admin / S4 |
| DELETE | `/locations/{id}`   | Admin / S4 |

## 10. Reports

| Method | Path | Notes |
|---|---|---|
| GET | `/reports/inventory`               | `?format=pdf|csv|json` |
| GET | `/reports/transactions`            | `?from=&to=&format=` |
| GET | `/reports/maintenance`             | `?format=` |
| GET | `/reports/audit`                   | `?from=&to=&format=` |
| GET | `/reports/gps/{equipmentId}`       | `?from=&to=&format=` |

---

## Error format

All errors are JSON:

```json
{ "message": "Human-readable summary", "errors": { "field": ["..."] } }
```

Status codes:

| Code | Meaning |
|---|---|
| 400 | Validation error |
| 401 | Not authenticated / token expired |
| 403 | Forbidden (role / clearance / RBAC) |
| 409 | Workflow conflict (e.g. firearm not available) |
| 419 | Challenge expired |
| 422 | Business rule violation |
| 429 | Rate limit exceeded |
| 500 | Server error |
