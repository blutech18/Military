/*
 * ArmoryDB · ESP32 GPS Tracker
 * ============================
 * Hardware : ESP32-WROOM-32 + GY-NEO6MV2 (u-blox NEO-6M)
 * Endpoint : POST /api/v1/gps/ingest   (HMAC-SHA256 signed body)
 *
 * Setup:
 *   1. Copy config.example.h -> config.h and edit it.
 *   2. Board: "ESP32 Dev Module". Libraries: TinyGPSPlus, ArduinoJson.
 *   3. Serial Monitor at 115200 baud.
 *
 * No hardware? Set SIMULATE_GPS 1 in config.h. The firmware then synthesises NMEA
 * internally instead of reading the UART, which is also the only way to run this in
 * Wokwi (it has no NEO-6M part). See diagram.json and iot/README.md section 10.
 *
 * Server contract enforced by the API (see GpsController::ingest):
 *   - Body must be signed with IOT_HMAC_SECRET, hex, in X-Armory-Signature.
 *   - captured_at must be no older than ARMORY_GPS_MAX_AGE_SECONDS (default 300)
 *     and no more than ARMORY_GPS_FUTURE_TOLERANCE_SECONDS ahead (default 30).
 *   - The firearm must have an Active/Overdue transaction with GPS tracking on.
 *   - (device_id, captured_at) must be new and newer than the last accepted fix.
 * This firmware only transmits payloads that can satisfy those rules.
 */

#include "config.h"

#include <WiFi.h>
#include <HTTPClient.h>
#include <HardwareSerial.h>
#include <TinyGPSPlus.h>
#include <ArduinoJson.h>
#include <mbedtls/md.h>
#include <time.h>

#if USE_HTTPS
#include <WiFiClientSecure.h>
#else
#include <WiFiClient.h>
#endif

#if HAS_LCD
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#endif

/* ========================= state ========================= */
TinyGPSPlus gps;
HardwareSerial GPSSerial(2); /* UART2 */

unsigned long lastTxMs = 0;
unsigned long lastWifiRetryMs = 0;
time_t lastAcceptedEpoch = 0; /* keeps captured_at strictly increasing */

/* ---------------------------------------------------------------------------
 * Keep every type declaration ABOVE the first function definition in this file.
 * The Arduino build step auto-generates function prototypes and injects them
 * just before the first function it finds. postFix() returns SendResult, so if
 * a function (for example the tamper ISR) were defined above this enum, the
 * injected prototype would reference an undeclared type and the build fails
 * with "'SendResult' does not name a type".
 * --------------------------------------------------------------------------- */
enum SendResult { SEND_OK, SEND_RETRY, SEND_DROP };

/* Short-lived queue for fixes taken while the link was down.
 * Kept in RAM only: the API discards anything older than its freshness
 * window, so persisting across reboots would just produce rejections. */
struct PendingFix {
  time_t epoch;
  String body;
};
static const int PENDING_MAX = 8;
PendingFix pending[PENDING_MAX];
int pendingCount = 0;

#if HAS_TAMPER_SWITCH
volatile bool tamperTriggered = false;
void IRAM_ATTR onTamper() { tamperTriggered = true; }
#endif

#if HAS_LCD
LiquidCrystal_I2C lcd(LCD_I2C_ADDR, 16, 2);
#endif

#if SIMULATE_GPS
/* ---------------- simulated GPS (Wokwi / no hardware) ----------------
 * Synthesises standard NMEA sentences and pushes them through TinyGPSPlus,
 * so every downstream code path behaves exactly as it does with a real module.
 */
double simLat = SIM_START_LAT;
double simLon = SIM_START_LON;
double simCourse = 90.0;
unsigned long lastSimMs = 0;

/* NTP is the only clock source in this mode. 2025-01-01 as a sanity floor. */
bool clockSynced() { return time(nullptr) > 1735689600L; }

/* Append the NMEA "$...*CC\r\n" framing and feed it byte by byte. */
void feedNmea(const String& body) {
  uint8_t sum = 0;
  for (size_t i = 0; i < body.length(); i++) sum ^= (uint8_t) body[i];

  char line[192];
  snprintf(line, sizeof(line), "$%s*%02X\r\n", body.c_str(), sum);
  for (const char* p = line; *p; p++) gps.encode(*p);
}

/* NMEA encodes coordinates as ddmm.mmmm / dddmm.mmmm, not decimal degrees. */
String nmeaDegrees(double value, int degreeDigits) {
  double a = fabs(value);
  int d = (int) a;
  double m = (a - d) * 60.0;

  char buf[20];
  snprintf(buf, sizeof(buf), "%0*d%07.4f", degreeDigits, d, m);
  return String(buf);
}

void simulateStep() {
  if (SIM_STEP_METERS <= 0.0) return;

  double bearing = random(0, 62832) / 10000.0; /* 0 .. 2*pi */
  const double earthRadius = 6378137.0;
  simLat += (SIM_STEP_METERS * cos(bearing)) / earthRadius * (180.0 / PI);
  simLon += (SIM_STEP_METERS * sin(bearing)) /
            (earthRadius * cos(simLat * PI / 180.0)) * (180.0 / PI);
  simCourse = fmod(bearing * 180.0 / PI, 360.0);
}

void emitSimulatedFix() {
  time_t now = time(nullptr);
  struct tm t;
  gmtime_r(&now, &t);

  /* Reduce to unsigned 0..99 so each field is provably two digits wide. */
  unsigned hh = (unsigned) t.tm_hour % 100u;
  unsigned mi = (unsigned) t.tm_min % 100u;
  unsigned ss = (unsigned) t.tm_sec % 100u;
  unsigned dd = (unsigned) t.tm_mday % 100u;
  unsigned mo = (unsigned) (t.tm_mon + 1) % 100u;
  unsigned yy = (unsigned) (t.tm_year + 1900) % 100u;

  char hms[8], dmy[8];
  snprintf(hms, sizeof(hms), "%02u%02u%02u", hh, mi, ss);
  snprintf(dmy, sizeof(dmy), "%02u%02u%02u", dd, mo, yy);

  String lat = nmeaDegrees(simLat, 2);
  String lon = nmeaDegrees(simLon, 3);
  char ns = simLat >= 0 ? 'N' : 'S';
  char ew = simLon >= 0 ? 'E' : 'W';

  char course[10];
  snprintf(course, sizeof(course), "%.1f", simCourse);

  /* Recommended minimum data: supplies position, date, time and speed. */
  feedNmea(String("GPRMC,") + hms + ".00,A," + lat + "," + ns + "," + lon + "," + ew +
           ",0.10," + course + "," + dmy + ",,");
  /* Fix data: supplies satellite count, HDOP and altitude. */
  feedNmea(String("GPGGA,") + hms + ".00," + lat + "," + ns + "," + lon + "," + ew +
           ",1,09,0.9,240.7,M,,M,,");
}
#endif

/* ========================= helpers ========================= */
String hmacSha256(const char* key, const String& msg) {
  byte out[32];
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, info, 1);
  mbedtls_md_hmac_starts(&ctx, (const unsigned char*) key, strlen(key));
  mbedtls_md_hmac_update(&ctx, (const unsigned char*) msg.c_str(), msg.length());
  mbedtls_md_hmac_finish(&ctx, out);
  mbedtls_md_free(&ctx);

  char hex[65];
  for (int i = 0; i < 32; i++) sprintf(hex + i * 2, "%02x", out[i]);
  hex[64] = '\0';
  return String(hex);
}

/* UTC calendar date -> Unix epoch, independent of the local timezone. */
time_t civilToEpoch(int y, int m, int d, int hh, int mi, int ss) {
  y -= m <= 2;
  const int era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = (unsigned) (y - era * 400);
  const unsigned doy = (153u * (m + (m > 2 ? -3 : 9)) + 2u) / 5u + d - 1;
  const unsigned doe = yoe * 365u + yoe / 4u - yoe / 100u + doy;
  const long long days = (long long) era * 146097LL + (long long) doe - 719468LL;
  return (time_t) (days * 86400LL + hh * 3600LL + mi * 60LL + ss);
}

String formatUtc(time_t epoch) {
  struct tm t;
  gmtime_r(&epoch, &t);
  char buf[24];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &t);
  return String(buf);
}

/* Only trust a GPS timestamp once the receiver reports a plausible date. */
bool gpsEpoch(time_t* out) {
  if (!gps.date.isValid() || !gps.time.isValid()) return false;
  if (gps.date.year() < 2024 || gps.date.year() > 2099) return false;

  *out = civilToEpoch(gps.date.year(), gps.date.month(), gps.date.day(),
                      gps.time.hour(), gps.time.minute(), gps.time.second());
  return true;
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
#if WIFI_CHANNEL > 0
  /* Naming the channel skips the scan phase (Wokwi's AP is on channel 6). */
  WiFi.begin(WIFI_SSID, WIFI_PASS, WIFI_CHANNEL);
#else
  WiFi.begin(WIFI_SSID, WIFI_PASS);
#endif
  Serial.printf("[wifi] connecting to %s", WIFI_SSID);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[wifi] connected  ip=%s  rssi=%d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("\n[wifi] failed — check SSID/password and use 2.4 GHz.");
  }
}

#if HAS_BATTERY_MONITOR
int readBatteryPct() {
  long raw = 0;
  for (int i = 0; i < 8; i++) raw += analogRead(BATTERY_PIN);
  raw /= 8;

#if SIMULATE_GPS
  /* Simulation: a potentiometer replaces the resistor divider, so map the raw
   * ADC reading straight onto 0-100%. Turning the knob then behaves like a
   * battery gauge. A real divider never spans the full ADC range this way. */
  long pct = map(raw, 0, 4095, 0, 100);
  return (int) constrain(pct, 0L, 100L);
#else
  float v = (raw / 4095.0f) * 3.3f * BATTERY_DIVIDER_RATIO;
  if (v >= 4.20f) return 100;
  if (v <= 3.30f) return 0;
  return (int) ((v - 3.30f) / (4.20f - 3.30f) * 100.0f);
#endif
}
#endif

#if HAS_STATUS_LEDS
void setStatusLeds(bool wifiOk, bool fixOk) {
  digitalWrite(LED_WIFI_PIN, wifiOk ? HIGH : LOW);
  digitalWrite(LED_FIX_PIN, fixOk ? HIGH : LOW);
}

/* One short flash on success, three rapid flashes on rejection. */
void pulseTxLed(bool ok) {
  if (ok) {
    digitalWrite(LED_TX_PIN, HIGH);
    delay(150);
    digitalWrite(LED_TX_PIN, LOW);
    return;
  }
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_TX_PIN, HIGH);
    delay(70);
    digitalWrite(LED_TX_PIN, LOW);
    delay(70);
  }
}
#endif

#if HAS_BUZZER
void chirpOk() {
  tone(BUZZER_PIN, 2200, 90);
  delay(110);
  noTone(BUZZER_PIN);
}

void alarmTamper() {
  for (int i = 0; i < 3; i++) {
    tone(BUZZER_PIN, 1400, 140);
    delay(180);
    tone(BUZZER_PIN, 900, 140);
    delay(180);
  }
  noTone(BUZZER_PIN);
}
#endif

#if HAS_LCD
/* Line 1 shows the device state, line 2 shows the payload being reported. */
void lcdStatus(const String& line1, const String& line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(line2.substring(0, 16));
}

void lcdShowFix(double lat, double lon, unsigned long sats) {
  char l1[20], l2[20];
  snprintf(l1, sizeof(l1), "%+09.4f %2lu sat", lat, sats);
  snprintf(l2, sizeof(l2), "%+010.4f", lon);
  lcdStatus(String(l1), String(l2));
}
#endif

/* ========================= transmit ========================= */
SendResult postFix(const String& body) {
  if (WiFi.status() != WL_CONNECTED) return SEND_RETRY;

#if USE_HTTPS
  WiFiClientSecure client;
#if ALLOW_INSECURE_TLS
  client.setInsecure(); /* lab bring-up only */
#else
  client.setCACert(ROOT_CA_CERT);
#endif
#else
  WiFiClient client;
#endif

  HTTPClient http;
  if (!http.begin(client, API_URL)) {
    Serial.println("[post] could not open connection");
    return SEND_RETRY;
  }

  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Accept", "application/json");
  http.addHeader("X-Armory-Signature", hmacSha256(HMAC_SECRET, body));
  http.addHeader("User-Agent", "ArmoryDB-ESP32/2.0");

  int code = http.POST(body);
  String resp = http.getString();
  http.end();

  if (code <= 0) {
    Serial.printf("[post] transport error %d — will retry\n", code);
    return SEND_RETRY;
  }

  Serial.printf("[post] HTTP %d  %s\n", code, resp.c_str());

  if (code >= 200 && code < 300) return SEND_OK;

  switch (code) {
    case 401:
      Serial.println("[post] signature rejected: HMAC_SECRET does not match "
                     "IOT_HMAC_SECRET in backend/.env. Fix config, not retrying.");
      return SEND_DROP;
    case 409:
      Serial.println("[post] rejected: firearm has no Active/Overdue transaction "
                     "with GPS tracking enabled, or this fix is duplicate/out of order.");
      return SEND_DROP;
    case 422:
      Serial.println("[post] rejected: payload invalid or timestamp outside the "
                     "allowed freshness window.");
      return SEND_DROP;
    case 429:
      Serial.println("[post] rate limited — will retry");
      return SEND_RETRY;
    case 503:
      Serial.println("[post] server reports IOT_HMAC_SECRET is not configured.");
      return SEND_RETRY;
    default:
      return (code >= 500) ? SEND_RETRY : SEND_DROP;
  }
}

void enqueue(time_t epoch, const String& body) {
  if (pendingCount == PENDING_MAX) {
    Serial.println("[queue] full — dropping oldest fix");
    for (int i = 1; i < PENDING_MAX; i++) pending[i - 1] = pending[i];
    pendingCount--;
  }
  pending[pendingCount].epoch = epoch;
  pending[pendingCount].body = body;
  pendingCount++;
  Serial.printf("[queue] holding %d fix(es)\n", pendingCount);
}

void dropFront() {
  for (int i = 1; i < pendingCount; i++) pending[i - 1] = pending[i];
  pendingCount--;
}

/* Flush oldest-first so captured_at stays monotonic on the server. */
void flushQueue(time_t nowEpoch) {
  while (pendingCount > 0) {
    if (nowEpoch - pending[0].epoch > MAX_FIX_AGE_SECONDS) {
      Serial.println("[queue] discarding fix older than the server window");
      dropFront();
      continue;
    }

    SendResult r = postFix(pending[0].body);
    if (r == SEND_RETRY) return; /* keep order, try again next cycle */

    if (r == SEND_OK && pending[0].epoch > lastAcceptedEpoch) {
      lastAcceptedEpoch = pending[0].epoch;
    }
    dropFront();
  }
}

/* ========================= setup / loop ========================= */
void setup() {
  Serial.begin(115200);
  delay(300);

  Serial.println();
  Serial.println("=== ArmoryDB GPS tracker ===");
  Serial.printf("device=%s  equipment_id=%d\n", DEVICE_ID, EQUIPMENT_ID);
  Serial.printf("endpoint=%s\n", API_URL);
  Serial.printf("interval=%d ms  transport=%s\n", TX_INTERVAL_MS,
                USE_HTTPS ? "HTTPS" : "HTTP");

#if SIMULATE_GPS
  Serial.println("[gps] SIMULATED mode — no GPS module is read");
  Serial.printf("[gps] start %.6f, %.6f  step %.1f m/s\n",
                (double) SIM_START_LAT, (double) SIM_START_LON, (double) SIM_STEP_METERS);
  randomSeed(micros());
#else
  GPSSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.printf("[gps] UART2 rx=%d tx=%d @%d baud\n", GPS_RX_PIN, GPS_TX_PIN, GPS_BAUD);
#endif

#if HAS_BATTERY_MONITOR
  pinMode(BATTERY_PIN, INPUT);
#endif
#if HAS_TAMPER_SWITCH
  pinMode(TAMPER_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(TAMPER_PIN), onTamper, FALLING);
#endif
#if HAS_STATUS_LEDS
  pinMode(LED_WIFI_PIN, OUTPUT);
  pinMode(LED_FIX_PIN, OUTPUT);
  pinMode(LED_TX_PIN, OUTPUT);
  setStatusLeds(false, false);
  digitalWrite(LED_TX_PIN, LOW);
  Serial.printf("[led] wifi=D%d fix=D%d tx=D%d\n", LED_WIFI_PIN, LED_FIX_PIN, LED_TX_PIN);
#endif
#if HAS_BUZZER
  pinMode(BUZZER_PIN, OUTPUT);
  noTone(BUZZER_PIN);
#endif
#if HAS_LCD
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  lcd.init();
  lcd.backlight();
  lcdStatus("ArmoryDB " DEVICE_ID, "booting...");
  Serial.printf("[lcd] 16x2 at 0x%02X on SDA=D%d SCL=D%d\n",
                LCD_I2C_ADDR, I2C_SDA_PIN, I2C_SCL_PIN);
#endif

  connectWifi();

#if HAS_LCD
  lcdStatus(WiFi.status() == WL_CONNECTED ? "WiFi connected" : "WiFi FAILED",
            WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : String("check config"));
#endif

#if SIMULATE_GPS
  /* Satellites normally supply UTC. In simulation NTP has to stand in. */
  configTime(0, 0, SIM_NTP_PRIMARY, SIM_NTP_SECONDARY);
  Serial.println("[boot] ready — waiting for NTP time");
#else
  Serial.println("[boot] ready — waiting for a GPS fix (antenna must face the sky)");
#endif
}

void loop() {
#if SIMULATE_GPS
  if (millis() - lastSimMs >= 1000) {
    lastSimMs = millis();
    if (clockSynced()) {
      simulateStep();
      emitSimulatedFix();
    }
  }
#else
  while (GPSSerial.available()) gps.encode(GPSSerial.read());
#endif

  if (WiFi.status() != WL_CONNECTED && millis() - lastWifiRetryMs > 15000) {
    lastWifiRetryMs = millis();
    Serial.println("[wifi] link down — reconnecting");
    WiFi.disconnect();
    connectWifi();
  }

#if HAS_TAMPER_SWITCH
  if (tamperTriggered) {
    tamperTriggered = false;
    /* Logged locally only: the ingest API has no tamper field yet. */
    Serial.println("[tamper] switch opened — physical tamper detected");
#if HAS_LCD
    lcdStatus("** TAMPER **", "device opened");
#endif
#if HAS_BUZZER
    alarmTamper();
#endif
  }
#endif

#if HAS_STATUS_LEDS
  setStatusLeds(WiFi.status() == WL_CONNECTED, gps.location.isValid());
#endif

  if (millis() - lastTxMs < (unsigned long) TX_INTERVAL_MS) {
    delay(20);
    return;
  }
  lastTxMs = millis();

  if (!gps.location.isValid()) {
#if SIMULATE_GPS
    Serial.println("[gps] waiting for NTP before the first simulated fix");
#if HAS_LCD
    lcdStatus("Waiting for NTP", "no fix yet");
#endif
#else
    Serial.printf("[gps] no fix yet (satellites=%lu)\n",
                  gps.satellites.isValid() ? (unsigned long) gps.satellites.value() : 0UL);
#if HAS_LCD
    lcdStatus("Acquiring GPS", "antenna to sky");
#endif
#endif
    return;
  }

  time_t epoch;
  if (!gpsEpoch(&epoch)) {
    Serial.println("[gps] fix has no valid UTC date/time yet — holding transmission");
    return;
  }

  /* The API rejects a repeated or older (device_id, captured_at). */
  if (epoch <= lastAcceptedEpoch) {
    Serial.println("[gps] timestamp not newer than last accepted fix — skipping");
    return;
  }

  /* ArduinoJson 7 replaced StaticJsonDocument; support both major versions. */
#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<512> doc;
#endif
  doc["equipment_id"] = EQUIPMENT_ID;
  doc["device_id"] = DEVICE_ID;
  doc["captured_at"] = formatUtc(epoch);
  doc["latitude"] = gps.location.lat();
  doc["longitude"] = gps.location.lng();
  doc["accuracy_meters"] = gps.hdop.isValid() ? gps.hdop.hdop() * 2.5 : 5.0;
  doc["speed_mps"] = gps.speed.isValid() ? max(0.0, gps.speed.mps()) : 0.0;
  doc["heading_deg"] = gps.course.isValid() ? gps.course.deg() : 0.0;
  if (gps.altitude.isValid()) doc["altitude_meters"] = gps.altitude.meters();
  if (gps.satellites.isValid()) doc["satellites"] = gps.satellites.value();
#if HAS_BATTERY_MONITOR
  doc["battery_pct"] = readBatteryPct();
#endif

  String body;
  serializeJson(doc, body);

  Serial.printf("[gps] %.6f, %.6f  sats=%lu  %s\n",
                gps.location.lat(), gps.location.lng(),
                gps.satellites.isValid() ? (unsigned long) gps.satellites.value() : 0UL,
                formatUtc(epoch).c_str());

  flushQueue(epoch); /* older fixes first, so ordering holds */

#if HAS_LCD
  lcdShowFix(gps.location.lat(), gps.location.lng(),
             gps.satellites.isValid() ? (unsigned long) gps.satellites.value() : 0UL);
#endif

  SendResult r = postFix(body);
  if (r == SEND_OK) {
    lastAcceptedEpoch = epoch;
  } else if (r == SEND_RETRY) {
    enqueue(epoch, body);
  }

#if HAS_STATUS_LEDS
  pulseTxLed(r == SEND_OK);
#endif
#if HAS_BUZZER
  if (r == SEND_OK) chirpOk();
#endif
#if HAS_LCD
  lcdStatus(r == SEND_OK ? "Uplink OK" : "Uplink FAILED",
            String("sent ") + formatUtc(epoch).substring(11, 19));
#endif
}
