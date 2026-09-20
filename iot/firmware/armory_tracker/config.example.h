/*
 * ArmoryDB · ESP32 tracker configuration template
 * ------------------------------------------------
 * 1. Copy this file to `config.h` in the same folder.
 * 2. Fill in your own values.
 * 3. `config.h` is git-ignored so real secrets never get committed.
 */
#pragma once

/* ---------- Wi-Fi (2.4 GHz only — ESP32 cannot join 5 GHz) ----------
 * For the Wokwi simulator use the virtual access point instead:
 *   WIFI_SSID "Wokwi-GUEST", WIFI_PASS "", WIFI_CHANNEL 6
 */
#define WIFI_SSID "YourWiFiName"
#define WIFI_PASS "YourWiFiPassword"

/* 0 = scan for the network. A fixed channel skips the scan and saves about
 * 4 seconds; Wokwi's virtual access point is always on channel 6. */
#define WIFI_CHANNEL 0

/* ---------- Backend endpoint ----------
 * Use the LAN IP of the machine running Laravel, never localhost/127.0.0.1.
 * Find it on Windows with: ipconfig  → IPv4 Address
 *   Local dev  : http://192.168.1.100:8000/api/v1/gps/ingest   (USE_HTTPS 0)
 *   Deployment : https://armory.10rcdg.local/api/v1/gps/ingest (USE_HTTPS 1)
 */
#define API_URL "http://192.168.1.100:8000/api/v1/gps/ingest"

/* 0 = plain HTTP (lab/LAN only). 1 = HTTPS. */
#define USE_HTTPS 0

/* Only used when USE_HTTPS is 1.
 * Set to 0 and paste your CA into ROOT_CA_CERT for verified TLS.
 * Setting this to 1 disables certificate validation — lab bring-up only. */
#define ALLOW_INSECURE_TLS 0

#if USE_HTTPS && !ALLOW_INSECURE_TLS
#define ROOT_CA_CERT                     \
  "-----BEGIN CERTIFICATE-----\n"        \
  "PASTE_YOUR_INSTITUTIONAL_CA_HERE\n"   \
  "-----END CERTIFICATE-----\n"
#endif

/* ---------- Device identity ----------
 * DEVICE_ID must be unique per tracker. The API enforces uniqueness on
 * (device_id, captured_at), so two trackers must never share an ID.
 * EQUIPMENT_ID must match firearm_equipment.equipment_id in the database.
 */
#define DEVICE_ID "ESP32-001"
#define EQUIPMENT_ID 1

/* ---------- Shared secret ----------
 * Must byte-for-byte equal IOT_HMAC_SECRET in backend/.env.
 */
#define HMAC_SECRET "CHANGE_ME_iot_shared_secret_at_least_32_chars_long_!!"

/* ---------- Timing ----------
 * Keep TX_INTERVAL_MS at or above 1000. The API rejects a repeated
 * (device_id, captured_at) pair, and timestamps have 1-second resolution.
 * 30000 matches the 30-second interval in the system requirements.
 */
#define TX_INTERVAL_MS 30000

/* Must not exceed ARMORY_GPS_MAX_AGE_SECONDS in backend/.env (default 300).
 * Queued fixes older than this are discarded instead of being rejected. */
#define MAX_FIX_AGE_SECONDS 240

/* ---------- GPS wiring (UART2) ---------- */
#define GPS_RX_PIN 16 /* ESP32 GPIO16  <-- GPS TX */
#define GPS_TX_PIN 17 /* ESP32 GPIO17  --> GPS RX */
#define GPS_BAUD 9600

/* ---------- Simulated GPS (Wokwi / bench testing without hardware) ----------
 * 1 = build NMEA sentences in code and feed them through TinyGPSPlus instead of
 *     reading the UART. The parsing, signing, and HTTP paths stay identical, so
 *     this exercises real firmware logic with no GPS module attached.
 * Wokwi has no NEO-6M part, so this is the only way to run there.
 * Keep 0 for real hardware.
 *
 * In this mode the clock comes from NTP, not from satellites, so the device
 * waits for NTP before transmitting. Otherwise the API rejects the timestamp.
 */
#define SIMULATE_GPS 0

/* Starting point for the simulated walk (default: Camp Evangelista area). */
#define SIM_START_LAT 8.484460
#define SIM_START_LON 124.657010

/* Metres moved per simulated second. 0 keeps the device stationary.
 * Raise it to walk out of a geofence and trigger a violation alert. */
#define SIM_STEP_METERS 6.0

/* NTP servers used only when SIMULATE_GPS is 1. */
#define SIM_NTP_PRIMARY "pool.ntp.org"
#define SIM_NTP_SECONDARY "time.nist.gov"

/* ---------- Optional battery monitor ----------
 * Leave 0 unless a resistor divider is actually wired to BATTERY_PIN,
 * otherwise the ADC reads noise and reports a meaningless percentage.
 */
#define HAS_BATTERY_MONITOR 0
#define BATTERY_PIN 34
#define BATTERY_DIVIDER_RATIO 2.0f

/* ---------- Optional tamper switch ----------
 * Detected and logged locally. The API does not store a tamper flag yet,
 * so nothing is transmitted for it.
 */
#define HAS_TAMPER_SWITCH 0
#define TAMPER_PIN 27

/* ---------- Optional status LEDs ----------
 * Each LED needs a 220R series resistor to GND.
 *   WIFI : on once associated with the access point
 *   FIX  : on once a position is valid
 *   TX   : 1 flash = fix accepted, 3 flashes = rejected
 */
#define HAS_STATUS_LEDS 0
#define LED_WIFI_PIN 25
#define LED_FIX_PIN 26
#define LED_TX_PIN 33

/* ---------- Optional 16x2 I2C LCD ----------
 * Shows live coordinates, satellite count and the last uplink result.
 * Requires the "LiquidCrystal I2C" library. Wokwi's module answers at 0x27.
 */
#define HAS_LCD 0
#define LCD_I2C_ADDR 0x27
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22

/* ---------- Optional piezo buzzer ----------
 * Short chirp on an accepted uplink, repeating alarm pattern on tamper.
 */
#define HAS_BUZZER 0
#define BUZZER_PIN 32
