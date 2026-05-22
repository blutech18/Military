# Sequence Diagrams

## A. Authentication (3 factors)

```mermaid
sequenceDiagram
  autonumber
  participant U as User Browser
  participant API as Laravel API
  participant DB as ArmoryDB
  participant CACHE as Cache (challenge)

  U->>API: POST /auth/login {username, password}
  API->>DB: SELECT users WHERE username=?
  DB-->>API: user row
  API->>API: bcrypt.compare(password)
  API->>CACHE: store challenge_token (5 min)
  API-->>U: {challenge_token, next: totp_setup}

  U->>API: POST /auth/totp/verify {challenge_token, code}
  API->>CACHE: load state
  API->>API: Google2FA.verifyKey(secret, code)
  API->>CACHE: state.totp_ok = true
  API-->>U: {next: biometric}

  U->>API: POST /auth/biometric/verify {challenge_token, fingerprint}
  API->>API: hash(template) == users.biometric_data
  API->>DB: UPDATE users SET last_login_*
  API->>DB: INSERT audit_logs (login)
  API->>API: Sanctum.createToken(15 min)
  API-->>U: {token, user}
```

## B. Firearm Issuance

```mermaid
sequenceDiagram
  autonumber
  participant CUS as Custodian (UI)
  participant API as Laravel API
  participant DB as ArmoryDB
  participant ESP as ESP32

  CUS->>API: POST /firearms/lookup (qr_payload)
  API->>DB: SELECT firearm_equipment
  DB-->>API: firearm row
  API-->>CUS: firearm data

  CUS->>API: POST /transactions/issue
  API->>DB: BEGIN; lock firearm_equipment FOR UPDATE
  DB-->>API: status = Available
  API->>DB: INSERT transactions (Active)
  API->>DB: UPDATE firearm SET availability=2
  API->>DB: INSERT audit_logs (issuance)
  DB-->>API: COMMIT
  API-->>CUS: 201 transaction

  ESP->>API: POST /gps/ingest (every 30 s, signed)
  API->>DB: INSERT gps_logs
  API->>API: geofence check
  API-->>ESP: 200 ok
```

## C. Firearm Return

```mermaid
sequenceDiagram
  autonumber
  participant CUS as Custodian (UI)
  participant API as Laravel API
  participant DB as ArmoryDB

  CUS->>API: POST /firearms/lookup (qr_payload)
  API-->>CUS: firearm data

  CUS->>API: PATCH /transactions/{id}/return {condition_on_return}
  API->>DB: lock transaction FOR UPDATE
  API->>DB: UPDATE transactions SET status=Returned, actual_return_at=now()
  API->>DB: UPDATE firearm SET availability_status=Available|Maintenance
  API->>DB: INSERT audit_logs (return)
  API-->>CUS: 200 transaction
```

## D. Overdue Sweep (scheduled)

```mermaid
sequenceDiagram
  autonumber
  participant SCHED as Scheduler
  participant API as Laravel API
  participant DB as ArmoryDB

  SCHED->>API: POST /transactions/sweep-overdue
  API->>DB: SELECT transactions WHERE status=Active AND expected_return_at < now()
  loop each
    API->>DB: UPDATE transactions SET status=Overdue
    API->>DB: UPDATE firearm SET availability_status=Overdue
    API->>DB: INSERT notifications (overdue_return, severity=warning)
    API->>DB: INSERT audit_logs (overdue_flagged)
  end
  API-->>SCHED: {flagged: N}
```
