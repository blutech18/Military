# IoT Tracker — ESP32 + GY-NEO6MV2

GPS tracker that posts HMAC-signed coordinates to `POST /api/v1/gps/ingest`.

- **Sketch:** `firmware/armory_tracker/` (open `armory_tracker.ino`)
- **No hardware yet?** `simulator/gps_simulator.py`
- **Buying parts, soldering, enclosure:** `HARDWARE_GUIDE.md`, `ESP32_IOT_BUILD_GUIDE.txt`
- **Superseded sketches:** `firmware/reference/` (reference only, not compiled)

---

## 1. Components and how they link together

| # | Component | Links to | Via |
|---|---|---|---|
| 1 | GPS satellites | GY-NEO6MV2 antenna | 1575.42 MHz radio |
| 2 | GY-NEO6MV2 | ESP32 | UART serial, 9600 baud |
| 3 | ESP32 | Wi-Fi access point | 2.4 GHz Wi-Fi |
| 4 | ESP32 | Laravel API | HTTP(S) POST, HMAC-SHA256 signed |
| 5 | Laravel API | `gps_logs` table | Eloquent, inside a DB transaction |
| 6 | Laravel API | Next.js live map | `GET /api/v1/gps/live` + SSE |

```
[satellites] --radio--> [GY-NEO6MV2] --UART--> [ESP32] --WiFi--> [Laravel] --> [DB] --> [dashboard]
```

Only link 2 is physical wiring. Everything after it is configuration.

---

## 2. Wire the GPS module to the ESP32

Power the ESP32 from USB only while wiring. Never wire with a battery attached.

| ESP32 pin | GY-NEO6MV2 pin | Wire |
|---|---|---|
| `3V3` | `VCC` | red |
| `GND` | `GND` | black |
| `GPIO16` (RX2) | `TX` | yellow |
| `GPIO17` (TX2) | `RX` | orange |

```
   ESP32                      GY-NEO6MV2
 ┌─────────┐                 ┌────────────┐
 │ 3V3   ●─┼─────────────────┼─● VCC      │
 │ GND   ●─┼─────────────────┼─● GND      │
 │ GPIO16●─┼─────────────────┼─● TX       │   <- crossover
 │ GPIO17●─┼─────────────────┼─● RX       │   <- crossover
 │  [USB]  │                 │ [antenna]  │
 └─────────┘                 └────────────┘
```

Three things that break this step:

- **TX/RX must cross.** GPS `TX` goes to ESP32 **RX** (GPIO16). Straight-through wiring gives no data.
- **Use `3V3`, not `5V`.** The GY-NEO6MV2 regulator accepts both, but 3V3 keeps the UART levels safe.
- **The ceramic antenna must face the sky.** No metal above it. GPS does not work indoors.

Optional battery monitor (only if you set `HAS_BATTERY_MONITOR 1`):

```
Battery+ ──[100kΩ]──┬──[100kΩ]── GND
                    └── GPIO34
```

Optional tamper switch (only if you set `HAS_TAMPER_SWITCH 1`): normally-closed reed
switch between `GPIO27` and `GND`. Detected and logged on the device; the ingest API
has no tamper field yet, so nothing is transmitted for it.

---

## 3. Link the backend

In `backend/.env`:

```env
IOT_HMAC_SECRET=<32+ random characters>
ARMORY_GPS_MAX_AGE_SECONDS=300
ARMORY_GPS_FUTURE_TOLERANCE_SECONDS=30
```

Then start the API bound to all interfaces so the ESP32 can reach it, and allow
the port through Windows Firewall:

```powershell
cd backend
php artisan config:clear
php artisan serve --host 0.0.0.0 --port 8000
```

Get the LAN IP the ESP32 will use (`ipconfig` → IPv4 Address, e.g. `192.168.1.100`).
`localhost` and `127.0.0.1` do not work from the device.

---

## 4. Link the firmware

```powershell
cd iot\firmware\armory_tracker
Copy-Item config.example.h config.h
```

Edit `config.h`:

| Setting | Value |
|---|---|
| `WIFI_SSID` / `WIFI_PASS` | your 2.4 GHz network |
| `API_URL` | `http://<LAN-IP>:8000/api/v1/gps/ingest` |
| `USE_HTTPS` | `0` on LAN, `1` with a real certificate |
| `DEVICE_ID` | unique per tracker |
| `EQUIPMENT_ID` | an existing `firearm_equipment.equipment_id` |
| `HMAC_SECRET` | byte-for-byte equal to `IOT_HMAC_SECRET` |

`config.h` is git-ignored, so the Wi-Fi password and shared secret stay out of the repo.

Arduino IDE 2.x: install the **esp32** board package, plus the **TinyGPSPlus** and
**ArduinoJson** libraries. Board **ESP32 Dev Module**, then Upload and open Serial
Monitor at **115200**.

---

## 5. Make the firearm eligible before expecting data

The API accepts a fix only when the firearm is genuinely issued. In the dashboard:

1. Issue the firearm whose `equipment_id` matches `config.h`.
2. Keep that transaction **Active** or **Overdue**.
3. Keep **GPS tracking enabled** on the transaction.

Skipping this returns `409` even when the wiring and signature are perfect.

---

## 6. Verify end to end

Take the device outdoors and watch Serial Monitor:

```
[wifi] connected  ip=192.168.1.50  rssi=-52 dBm
[gps] no fix yet (satellites=0)
[gps] 8.484512, 124.657089  sats=8  2026-09-13T04:21:30Z
[post] HTTP 200  {"ok":true,"gps_log_id":15,"inside_geofence":true,"inside_armory":false}
```

Then open the dashboard live map as a staff role and confirm the marker appears.
GPS pages are restricted to Administrator, Command Officer, S4 Officer, and Armory
Custodian; a Personnel account gets `403`.

---

## 7. Payload and signature

`X-Armory-Signature` is the lowercase hex HMAC-SHA256 of the **exact raw body**,
keyed with the shared secret. Re-serializing the JSON before signing breaks it.

```json
{
  "equipment_id": 1,
  "device_id": "ESP32-001",
  "captured_at": "2026-09-13T04:21:30Z",
  "latitude": 8.484460,
  "longitude": 124.657010,
  "accuracy_meters": 4.5,
  "speed_mps": 0.0,
  "heading_deg": 152.3,
  "altitude_meters": 240.7,
  "satellites": 9
}
```

`transaction_id` is optional. Omit it and the server resolves the current
transaction itself; send a mismatched one and the fix is rejected.

---

## 8. Response codes

| Code | Meaning | Action |
|---|---|---|
| `200` | Stored | none |
| `401` | Signature mismatch | make `HMAC_SECRET` equal `IOT_HMAC_SECRET` |
| `409` | No Active/Overdue transaction with tracking on, or duplicate/out-of-order fix | issue the firearm; check the clock |
| `422` | Invalid field, or timestamp too old/too far ahead | check GPS time sync |
| `429` | Rate limited (60 req/s bucket) | slow down |
| `503` | `IOT_HMAC_SECRET` not set on the server | set it, then `php artisan config:clear` |

The firmware retries only `429`, `5xx`, and transport errors. Configuration
failures such as `401` and `409` are logged and dropped instead of looping.

---

## 9. Timestamp rules that matter on the device

The API enforces replay and ordering protection, so the firmware:

- transmits only after the receiver reports a valid UTC date (year ≥ 2024), because
  an unsynced clock produces a `422`;
- never repeats or goes backwards on `captured_at`, because `(device_id, captured_at)`
  is unique and must increase;
- queues at most 8 fixes in RAM while the link is down and **discards** any fix older
  than `MAX_FIX_AGE_SECONDS`, since the server would reject it anyway.

A reboot clears that queue by design. Long-term offline storage would only produce
payloads too stale to be accepted.

---

## 10. Run it in Wokwi (no hardware at all)

[Wokwi](https://wokwi.com/projects/new/esp32) runs the real firmware in a browser.
`diagram.json` and `libraries.txt` in the sketch folder are for this; the Arduino IDE
ignores both.

Wokwi has no NEO-6M part, so set `SIMULATE_GPS 1` in `config.h`. The firmware then
builds NMEA sentences in code and feeds them through TinyGPSPlus, keeping the parsing,
signing, and HTTP paths identical to the hardware build.

Wokwi settings in `config.h`:

```cpp
#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASS ""
#define WIFI_CHANNEL 6
#define SIMULATE_GPS 1
```

Then pick how the simulator reaches your API:

| Your situation | `API_URL` | Notes |
|---|---|---|
| Paid Wokwi + Private Gateway running | `http://host.wokwi.internal:8000/api/v1/gps/ingest` | Closest match to real hardware |
| Free Wokwi | public tunnel URL (ngrok / Cloudflare) with `USE_HTTPS 1` | Free gateway cannot reach your LAN |

### Getting the code into Wokwi

Run the generator once:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File iot\tools\make_wokwi_sketch.ps1
```

It writes `iot/wokwi/` containing `sketch.ino` (with `config.h` inlined so there is
only one file to paste), `diagram.json`, `wokwi.toml`, and a locally compiled
`build/`. Re-run it after editing `config.h` or the firmware. The folder is
git-ignored because the inlined config holds your Wi-Fi password and shared secret.

**Route A — browser.** Paste `sketch.ino` into Wokwi's **sketch.ino** tab and
`diagram.json` into the **diagram.json** tab, then add **TinyGPSPlus**,
**ArduinoJson** and **LiquidCrystal I2C** from **Library Manager**. Builds run on
Wokwi's shared servers, so you may hit a "Build Servers Busy" queue; retrying
usually clears it. Saving a project needs a free Wokwi account — without one you get
a single save, then "Project saving failed".

**Route B — VS Code (more reliable).** Install the *Wokwi for VS Code* extension,
press `F1` → *Wokwi: Request a new License* (free), open the `iot/wokwi` folder, then
`F1` → *Wokwi: Start Simulator*. This compiles locally, so there is no build queue,
and the extension bundles the **Private IoT Gateway** — meaning the simulated ESP32
can reach your machine directly and **ngrok is not needed**. Switch two lines in
`config.h` and regenerate:

```cpp
#define API_URL "http://host.wokwi.internal:8000/api/v1/gps/ingest"
#define USE_HTTPS 0
```

Prefer two files in the browser instead of the inlined one? Use the chevron at the
right-hand end of Wokwi's tab strip to add a file named exactly `config.h`, paste
`iot/firmware/armory_tracker/config.h` into it, and use the unmodified
`armory_tracker.ino` in the sketch tab.

### What the diagram contains

There is no NEO-6M part in Wokwi, so the GPS module cannot appear on the canvas —
coordinates come from `SIMULATE_GPS` instead. The other components are real parts
wired to features the firmware genuinely implements:

| Part | Pin | Behaviour |
|---|---|---|
| LCD 1602 (I2C) | `GPIO21/22` | Live coordinates, satellites, uplink result |
| Green LED | `GPIO25` | On once associated with the access point |
| Blue LED | `GPIO26` | On once a position is valid |
| Yellow LED | `GPIO33` | 1 flash = fix accepted, 3 flashes = rejected |
| Pushbutton "TAMPER" | `GPIO27` | Fires the tamper interrupt; alarms on LCD + buzzer |
| Potentiometer "BATTERY" | `GPIO34` | Sets `battery_pct` in the payload |
| Piezo buzzer | `GPIO32` | Chirp on accepted uplink, alarm pattern on tamper |

Enable them with `HAS_LCD`, `HAS_STATUS_LEDS`, `HAS_TAMPER_SWITCH`,
`HAS_BATTERY_MONITOR`, and `HAS_BUZZER`. Every combination compiles; each is
independent, so switch off anything you do not want on the canvas.

### Components that cannot be simulated

| Guide component | Why not | Where it is tested |
|---|---|---|
| GY-NEO6MV2 GPS | No GPS part exists in Wokwi | `SIMULATE_GPS`, then real hardware |
| Li-Po battery, TP4056, 5V boost | Wokwi does not simulate power supplies | Bench test with a multimeter |
| Breadboard, jumper wires, enclosure | Physical assembly only | Section 2 and the hardware guides |
| Futronic FS80H/FS88H scanner | USB device on the Windows workstation, not on the ESP32 | Vendor SDK + bridge app |
| Arduino Nano (optional watchdog) | Its role is power management, which is not simulated | Optional on real hardware |

The reed switch and the 100k/100k divider *are* represented — by the pushbutton and
the potentiometer respectively, driving the same firmware code paths.

The potentiometer is mapped differently in simulation: the raw ADC reading maps
straight onto 0-100% so the knob acts as a battery gauge. On real hardware the same
pin is read as a voltage through the 100k/100k divider, which never spans the full
ADC range. Both paths live in `readBatteryPct()`.

Because there are no satellites, the clock comes from NTP. The device prints
`waiting for NTP before the first simulated fix` until it syncs, then transmits
normally. Set `SIM_STEP_METERS` higher to walk out of a geofence and exercise the
violation alert.

> **Security note.** Wokwi's free Public Gateway monitors traffic and its own docs
> advise against sensitive data. Anything you send there — including
> `IOT_HMAC_SECRET` and coordinates — leaves your network. Use a throwaway secret
> and seeded demo data only, never production values, and close any tunnel afterwards.

## 11. No hardware? Use the simulator

```powershell
cd iot\simulator
python gps_simulator.py --equipment 1 --secret "<same as IOT_HMAC_SECRET>" --count 20 --interval 5
```

The firearm still needs an Active/Overdue transaction with GPS tracking enabled.
