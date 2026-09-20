/*
 * ArmoryDB · ESP32 GPS Tracker Firmware
 *  Hardware: ESP32-WROOM-32 + GY-NEO6MV2 (u-blox NEO-6M)
 *  Transmits encrypted, HMAC-signed GPS coordinates to the ArmoryDB API.
 *
 *  Authors: 10RCDG Capstone Team — December 2025
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <HardwareSerial.h>
#include <TinyGPSPlus.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <mbedtls/md.h>
#include <time.h>

/* =========================================================
 *  CONFIGURATION  (edit before flashing)
 * ========================================================= */
const char* WIFI_SSID         = "10RCDG-Armory-AP";
const char* WIFI_PASS         = "REPLACE_ME";
const char* API_URL           = "https://armory.10rcdg.local/api/v1/gps/ingest";
const char* DEVICE_ID         = "ESP32-001-FIREARM-PA-M4-001";
const int   EQUIPMENT_ID      = 1;       // matches firearm_equipment.equipment_id
const char* HMAC_SECRET       = "MUST_MATCH_LARAVEL_IOT_HMAC_SECRET";
const int   GPS_INTERVAL_MS   = 30000;   // 30 s per SRS NFR-2
const int   GPS_RX_PIN        = 16;
const int   GPS_TX_PIN        = 17;
const int   GPS_BAUD          = 9600;
const int   BATTERY_PIN       = 34;      // ADC pin to voltage divider
const int   TAMPER_PIN        = 27;      // NC reed switch / tamper input

/* Replace with your TLS root CA certificate (PEM) for production. */
const char* ROOT_CA_CERT = R"PEM(
-----BEGIN CERTIFICATE-----
PASTE_YOUR_INSTITUTIONAL_CA_HERE
-----END CERTIFICATE-----
)PEM";

/* =========================================================
 *  STATE
 * ========================================================= */
TinyGPSPlus gps;
HardwareSerial GPSSerial(2);     // UART2
Preferences  prefs;
unsigned long lastSendMs = 0;
volatile bool tamperTriggered = false;

/* =========================================================
 *  HMAC-SHA256 helper
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
 *  Wi-Fi
 * ========================================================= */
void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[WiFi] Connecting");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 30000) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] OK · IP %s · RSSI %d\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("\n[WiFi] Failed.");
  }
}

/* =========================================================
 *  ISO-8601 UTC timestamp from GPS time + UTC clock
 * ========================================================= */
String gpsTimestamp() {
  if (!gps.date.isValid() || !gps.time.isValid()) {
    time_t now = time(nullptr);
    struct tm* t = gmtime(&now);
    char buf[32];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", t);
    return String(buf);
  }
  char buf[32];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02dZ",
           gps.date.year(), gps.date.month(), gps.date.day(),
           gps.time.hour(), gps.time.minute(), gps.time.second());
  return String(buf);
}

/* =========================================================
 *  Battery
 * ========================================================= */
int readBatteryPct() {
  int raw = analogRead(BATTERY_PIN);
  // 12-bit ADC, voltage divider 2:1 — calibrate for your hardware.
  float v = (raw / 4095.0f) * 3.3f * 2.0f;
  if (v >= 4.20f) return 100;
  if (v <= 3.30f) return 0;
  return (int) ((v - 3.30f) / (4.20f - 3.30f) * 100.0f);
}

/* =========================================================
 *  Build & POST payload (with offline buffer fallback)
 * ========================================================= */
void IRAM_ATTR onTamper() { tamperTriggered = true; }

void bufferOffline(const String& body) {
  prefs.begin("armory", false);
  uint8_t count = prefs.getUChar("count", 0);
  String key = "p" + String(count % 32);
  prefs.putString(key.c_str(), body);
  prefs.putUChar("count", count + 1);
  prefs.end();
  Serial.println("[BUFFER] Stored payload offline.");
}

void flushBuffer() {
  prefs.begin("armory", false);
  uint8_t count = prefs.getUChar("count", 0);
  prefs.end();
  if (count == 0) return;
  Serial.printf("[BUFFER] Replaying %u stored payloads\n", count);
  // (Implementation left brief — replay with same signing process.)
}

bool sendPayload(const String& body) {
  if (WiFi.status() != WL_CONNECTED) {
    bufferOffline(body);
    return false;
  }

  WiFiClientSecure client;
  client.setCACert(ROOT_CA_CERT);
  // For demo / lab without proper CA, comment-out setCACert and use:
  //   client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, API_URL)) {
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

  Serial.printf("[POST] %d  %s\n", code, resp.c_str());
  if (code >= 200 && code < 300) return true;

  bufferOffline(body);
  return false;
}

/* =========================================================
 *  Setup / Loop
 * ========================================================= */
void setup() {
  Serial.begin(115200);
  delay(300);
  GPSSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  pinMode(BATTERY_PIN, INPUT);
  pinMode(TAMPER_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(TAMPER_PIN), onTamper, FALLING);

  connectWifi();
  // NTP for fallback timestamp
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  Serial.println("[BOOT] ArmoryDB GPS firmware ready.");
}

void loop() {
  while (GPSSerial.available()) gps.encode(GPSSerial.read());

  if (millis() - lastSendMs >= (unsigned long) GPS_INTERVAL_MS) {
    lastSendMs = millis();

    if (!gps.location.isValid()) {
      Serial.println("[GPS] No fix yet.");
      return;
    }

    StaticJsonDocument<512> doc;
    doc["equipment_id"]  = EQUIPMENT_ID;
    doc["device_id"]     = DEVICE_ID;
    doc["captured_at"]   = gpsTimestamp();
    doc["latitude"]      = gps.location.lat();
    doc["longitude"]     = gps.location.lng();
    doc["accuracy_meters"] = gps.hdop.isValid() ? gps.hdop.hdop() * 2.5 : 5.0;
    doc["speed_mps"]     = gps.speed.isValid() ? gps.speed.mps() : 0.0;
    doc["heading_deg"]   = gps.course.isValid() ? gps.course.deg() : 0.0;
    doc["altitude_meters"] = gps.altitude.isValid() ? gps.altitude.meters() : 0.0;
    doc["satellites"]    = gps.satellites.isValid() ? gps.satellites.value() : 0;
    doc["battery_pct"]   = readBatteryPct();
    if (tamperTriggered) {
      doc["tamper"]      = true;
      tamperTriggered    = false;
    }

    String body;
    serializeJson(doc, body);

    Serial.printf("[GPS] %.6f, %.6f sats=%lu\n",
                  gps.location.lat(), gps.location.lng(),
                  (unsigned long) gps.satellites.value());

    sendPayload(body);
    flushBuffer();
  }

  // gentle CPU yield
  delay(20);
}
