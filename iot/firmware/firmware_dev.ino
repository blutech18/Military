/*
 * ArmoryDB · ESP32 GPS Tracker Firmware (DEVELOPMENT VERSION - HTTP)
 * ==================================================================
 * This is the LOCAL DEVELOPMENT version that uses HTTP (no SSL).
 * Use this when testing with XAMPP / php artisan serve on your local network.
 *
 * For production, use firmware.ino which uses HTTPS with certificate pinning.
 *
 * Hardware: ESP32-WROOM-32 + GY-NEO6MV2 (u-blox NEO-6M)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClient.h>
#include <HardwareSerial.h>
#include <TinyGPSPlus.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <mbedtls/md.h>
#include <time.h>

/* =========================================================
 *  CONFIGURATION — EDIT THESE BEFORE UPLOADING
 * ========================================================= */

// ---- WiFi ----
// Your WiFi name and password (must be 2.4GHz, ESP32 doesn't support 5GHz)
const char* WIFI_SSID         = "YourWiFiName";       // ← CHANGE THIS
const char* WIFI_PASS         = "YourWiFiPassword";   // ← CHANGE THIS

// ---- Backend API ----
// Use your computer's local IP address (find it with: ipconfig in CMD)
// Example: "http://192.168.1.100:8000/api/v1/gps/ingest"
// DO NOT use "localhost" or "127.0.0.1" — the ESP32 can't reach those!
const char* API_URL           = "http://192.168.1.100:8000/api/v1/gps/ingest";  // ← CHANGE THIS

// ---- Device Identity ----
// Each ESP32 tracker gets a unique device ID and is linked to one firearm
const char* DEVICE_ID         = "ESP32-001";          // unique name for this device
const int   EQUIPMENT_ID      = 1;                    // must match firearm_equipment.equipment_id in your DB

// ---- Security ----
// This MUST exactly match the IOT_HMAC_SECRET in your backend/.env file
const char* HMAC_SECRET       = "CHANGE_ME_iot_shared_secret_at_least_32_chars_long_!!";  // ← CHANGE THIS

// ---- GPS Settings ----
const int   GPS_INTERVAL_MS   = 30000;   // Send GPS every 30 seconds
const int   GPS_RX_PIN        = 16;      // ESP32 GPIO16 ← GPS TX
const int   GPS_TX_PIN        = 17;      // ESP32 GPIO17 → GPS RX
const int   GPS_BAUD          = 9600;    // GPS module baud rate (default for NEO-6M)

// ---- Battery (optional) ----
const int   BATTERY_PIN       = 34;      // ADC pin for voltage divider (optional)

/* =========================================================
 *  STATE — Don't edit below unless you know what you're doing
 * ========================================================= */
TinyGPSPlus gps;
HardwareSerial GPSSerial(2);     // UART2
Preferences  prefs;
unsigned long lastSendMs = 0;

/* =========================================================
 *  HMAC-SHA256 — Signs the payload so the server can verify it
 * ========================================================= */
String hmacSha256(const String& key, const String& msg) {
  byte hmac[32];
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, info, 1);
  mbedtls_md_hmac_starts(&ctx, (const unsigned char*) key.c_str(), key.length());
  mbedtls_md_hmac_update(&ctx, (const unsigned char*) msg.c_str(), msg.length());
  mbedtls_md_hmac_finish(&ctx, hmac);
  mbedtls_md_free(&ctx);

  char hex[65];
  for (int i = 0; i < 32; i++) sprintf(hex + i * 2, "%02x", hmac[i]);
  hex[64] = 0;
  return String(hex);
}

/* =========================================================
 *  WiFi Connection
 * ========================================================= */
void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[WiFi] Connecting to ");
  Serial.print(WIFI_SSID);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 30000) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Connected! IP: %s  Signal: %d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("\n[WiFi] FAILED to connect. Check SSID/password.");
    Serial.println("[WiFi] Remember: ESP32 only supports 2.4GHz WiFi!");
  }
}

/* =========================================================
 *  Timestamp (ISO-8601 UTC)
 * ========================================================= */
String gpsTimestamp() {
  if (gps.date.isValid() && gps.time.isValid()) {
    char buf[32];
    snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02dZ",
             gps.date.year(), gps.date.month(), gps.date.day(),
             gps.time.hour(), gps.time.minute(), gps.time.second());
    return String(buf);
  }
  // Fallback to NTP time
  time_t now = time(nullptr);
  struct tm* t = gmtime(&now);
  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", t);
  return String(buf);
}

/* =========================================================
 *  Battery Reading (optional — returns 0-100%)
 * ========================================================= */
int readBatteryPct() {
  int raw = analogRead(BATTERY_PIN);
  float v = (raw / 4095.0f) * 3.3f * 2.0f;  // Assumes 2:1 voltage divider
  if (v >= 4.20f) return 100;
  if (v <= 3.30f) return 0;
  return (int) ((v - 3.30f) / (4.20f - 3.30f) * 100.0f);
}

/* =========================================================
 *  Offline Buffer — Stores GPS fixes when WiFi is down
 * ========================================================= */
void bufferOffline(const String& body) {
  prefs.begin("armory", false);
  uint8_t count = prefs.getUChar("count", 0);
  String key = "p" + String(count % 32);  // circular buffer of 32 entries
  prefs.putString(key.c_str(), body);
  prefs.putUChar("count", count + 1);
  prefs.end();
  Serial.println("[BUFFER] Stored payload offline (will retry later).");
}

/* =========================================================
 *  Send GPS Data to Server
 * ========================================================= */
bool sendPayload(const String& body) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[SEND] No WiFi — buffering offline.");
    bufferOffline(body);
    return false;
  }

  WiFiClient client;  // Plain HTTP for local development
  HTTPClient http;

  if (!http.begin(client, API_URL)) {
    Serial.println("[SEND] Failed to begin HTTP connection.");
    bufferOffline(body);
    return false;
  }

  http.setTimeout(7000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Armory-Signature", hmacSha256(HMAC_SECRET, body));
  http.addHeader("User-Agent", "ArmoryDB-ESP32/1.0");

  int code = http.POST(body);
  String resp = http.getString();
  http.end();

  if (code >= 200 && code < 300) {
    Serial.printf("[SEND] OK! HTTP %d — %s\n", code, resp.c_str());
    return true;
  }

  Serial.printf("[SEND] FAILED! HTTP %d — %s\n", code, resp.c_str());
  bufferOffline(body);
  return false;
}

/* =========================================================
 *  SETUP — Runs once when ESP32 powers on
 * ========================================================= */
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("╔══════════════════════════════════════════╗");
  Serial.println("║  ArmoryDB GPS Tracker (DEV MODE)        ║");
  Serial.println("║  10RCDG Firearm Tracking System         ║");
  Serial.println("╚══════════════════════════════════════════╝");

  // Start GPS serial
  GPSSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.printf("[GPS] UART2 started on RX=%d, TX=%d at %d baud\n", GPS_RX_PIN, GPS_TX_PIN, GPS_BAUD);

  // Optional battery pin
  pinMode(BATTERY_PIN, INPUT);

  // Connect to WiFi
  connectWifi();

  // Set up NTP for fallback timestamps
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  Serial.println("[BOOT] Ready! Waiting for GPS fix...");
  Serial.printf("[BOOT] Will send to: %s\n", API_URL);
  Serial.printf("[BOOT] Equipment ID: %d  Device: %s\n", EQUIPMENT_ID, DEVICE_ID);
  Serial.printf("[BOOT] Interval: %d ms\n", GPS_INTERVAL_MS);
}

/* =========================================================
 *  LOOP — Runs continuously
 * ========================================================= */
void loop() {
  // Read all available GPS data
  while (GPSSerial.available()) {
    gps.encode(GPSSerial.read());
  }

  // Check if it's time to send
  if (millis() - lastSendMs >= (unsigned long) GPS_INTERVAL_MS) {
    lastSendMs = millis();

    // Check if we have a valid GPS fix
    if (!gps.location.isValid()) {
      Serial.println("[GPS] No fix yet — make sure antenna faces the sky (outdoors).");
      return;
    }

    // Build JSON payload
    StaticJsonDocument<512> doc;
    doc["equipment_id"]    = EQUIPMENT_ID;
    doc["device_id"]       = DEVICE_ID;
    doc["captured_at"]     = gpsTimestamp();
    doc["latitude"]        = gps.location.lat();
    doc["longitude"]       = gps.location.lng();
    doc["accuracy_meters"] = gps.hdop.isValid() ? gps.hdop.hdop() * 2.5 : 5.0;
    doc["speed_mps"]       = gps.speed.isValid() ? gps.speed.mps() : 0.0;
    doc["heading_deg"]     = gps.course.isValid() ? gps.course.deg() : 0.0;
    doc["altitude_meters"] = gps.altitude.isValid() ? gps.altitude.meters() : 0.0;
    doc["satellites"]      = gps.satellites.isValid() ? gps.satellites.value() : 0;
    doc["battery_pct"]     = readBatteryPct();

    String body;
    serializeJson(doc, body);

    // Print to serial monitor
    Serial.printf("[GPS] Lat: %.6f  Lon: %.6f  Sats: %lu  Alt: %.1fm\n",
                  gps.location.lat(), gps.location.lng(),
                  (unsigned long) gps.satellites.value(),
                  gps.altitude.meters());

    // Send to server
    sendPayload(body);
  }

  delay(20);  // Small delay to prevent CPU hogging
}
