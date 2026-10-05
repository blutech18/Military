/*
 * ArmoryDB · GPS wiring test (no Wi-Fi, no backend)
 * =================================================
 * Upload this BEFORE armory_tracker to prove the GY-NEO6MV2 is wired correctly.
 * Serial Monitor: 115200 baud.
 *
 * Wiring this test expects (crossover — module TX goes to the ESP32's RX pin):
 *   GPS VCC -> ESP32 3V3
 *   GPS GND -> ESP32 GND
 *   GPS TX  -> ESP32 D18 (GPIO18)   = ESP32 receives here
 *   GPS RX  -> ESP32 D19 (GPIO19)   = ESP32 transmits here
 *
 * If nothing arrives on 18, the sketch also listens on 19 and tells you
 * which pin the module is really talking on, so a swapped pair is obvious.
 *
 * Sky test: every 5 s it reports how many satellites the module can HEAR (from the GSV
 * sentences) and how strongly, long before a position fix. Hearing even one or two satellites
 * proves the antenna and receiver work; a fix needs about four with good signal.
 *   signal strength (dB-Hz):  <20 weak | 20-30 usable | >30 strong
 */
#include <HardwareSerial.h>
#include <TinyGPSPlus.h>

static const int PIN_A = 18;
static const int PIN_B = 19;
static const uint32_t GPS_BAUD = 9600;

HardwareSerial GPSSerial(2);
TinyGPSPlus gps;

/* Each GPGSV sentence lists up to 4 satellites as (PRN, elevation, azimuth, SNR) groups. */
TinyGPSCustom gsvInView(gps, "GPGSV", 3);
TinyGPSCustom gsvPrn1(gps, "GPGSV", 4),  gsvSnr1(gps, "GPGSV", 7);
TinyGPSCustom gsvPrn2(gps, "GPGSV", 8),  gsvSnr2(gps, "GPGSV", 11);
TinyGPSCustom gsvPrn3(gps, "GPGSV", 12), gsvSnr3(gps, "GPGSV", 15);
TinyGPSCustom gsvPrn4(gps, "GPGSV", 16), gsvSnr4(gps, "GPGSV", 19);

static const int MAX_PRN = 64;
int satSnr[MAX_PRN + 1];
unsigned long satSeenMs[MAX_PRN + 1];
unsigned long firstSignalMs = 0; /* when the first satellite was heard */
unsigned long firstFixMs = 0;    /* when the first position fix appeared */

void noteSat(TinyGPSCustom& prn, TinyGPSCustom& snr) {
  bool a = prn.isUpdated();
  bool b = snr.isUpdated();
  if (!a && !b) return;

  int id = atoi(prn.value());
  int v = atoi(snr.value()); /* empty SNR means "tracked but no signal" -> 0 */
  if (id < 1 || id > MAX_PRN) return;

  satSnr[id] = v;
  satSeenMs[id] = millis();
  if (v > 0 && firstSignalMs == 0) firstSignalMs = millis();
}

int rxPin = PIN_A;
int txPin = PIN_B;
unsigned long bytesSeen = 0;
unsigned long lastReportMs = 0;
unsigned long listenStartMs = 0;
bool echoRaw = true;

void listenOn(int rx, int tx) {
  GPSSerial.end();
  GPSSerial.begin(GPS_BAUD, SERIAL_8N1, rx, tx);
  rxPin = rx;
  txPin = tx;
  bytesSeen = 0;
  listenStartMs = millis();
  Serial.printf("\n[test] listening for GPS data on GPIO%d (ESP32 RX), GPIO%d (ESP32 TX)\n", rx, tx);
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== GPS wiring test ===");
  listenOn(PIN_A, PIN_B);
}

void loop() {
  while (GPSSerial.available()) {
    char c = GPSSerial.read();
    bytesSeen++;
    gps.encode(c);
    if (echoRaw) Serial.write(c);
    noteSat(gsvPrn1, gsvSnr1);
    noteSat(gsvPrn2, gsvSnr2);
    noteSat(gsvPrn3, gsvSnr3);
    noteSat(gsvPrn4, gsvSnr4);
  }

  /* Nothing in 5 s on this pin? Try the other one once. */
  if (bytesSeen == 0 && millis() - listenStartMs > 5000) {
    if (rxPin == PIN_A) {
      Serial.println("[test] no bytes on GPIO18 — trying GPIO19 in case TX/RX are swapped");
      listenOn(PIN_B, PIN_A);
    } else {
      Serial.println("[test] no bytes on either pin. Check: GPS VCC->3V3, GND->GND, "
                     "module LED on, jumper wires seated. Retrying GPIO18...");
      listenOn(PIN_A, PIN_B);
    }
    return;
  }

  if (millis() - lastReportMs < 5000) return;
  lastReportMs = millis();
  if (bytesSeen == 0) return;

  /* After the first report, stop echoing raw NMEA so the summary is readable. */
  echoRaw = false;

  Serial.println();
  Serial.println("------------------------------------------------------------");

  /* A stray byte or two is line noise, not a GPS. Require a checksummed sentence. */
  static unsigned long lastChars = 0;
  bool flowing = gps.charsProcessed() > lastChars;
  lastChars = gps.charsProcessed();
  if (gps.passedChecksum() == 0) {
    Serial.printf("[wiring] only noise on GPIO%d (%lu bytes, no valid NMEA) - GPS not connected here\n",
                  rxPin, gps.charsProcessed());
    return;
  }
  if (!flowing) {
    Serial.println("[wiring] DATA STOPPED - GPS lost power or the TX wire came loose. Re-seat the wires.");
    return;
  }
  Serial.printf("[wiring] OK - receiving on GPIO%d. Set GPS_RX_PIN %d and GPS_TX_PIN %d in config.h\n",
                rxPin, rxPin, txPin);
  Serial.printf("[nmea]   chars=%lu  good sentences=%lu  checksum errors=%lu\n",
                gps.charsProcessed(), gps.passedChecksum(), gps.failedChecksum());

  if (gps.failedChecksum() > gps.passedChecksum() && gps.charsProcessed() > 500) {
    Serial.println("[nmea]   mostly garbage - baud mismatch or loose wire");
  }

  /* Satellites heard in the last 10 s, and the strongest of them. */
  int heard = 0, strong = 0, best = 0;
  for (int id = 1; id <= MAX_PRN; id++) {
    if (satSeenMs[id] == 0 || millis() - satSeenMs[id] > 10000UL || satSnr[id] <= 0) continue;
    heard++;
    if (satSnr[id] >= 25) strong++;
    if (satSnr[id] > best) best = satSnr[id];
  }
  int inView = gsvInView.isValid() ? atoi(gsvInView.value()) : 0;
  unsigned long used = gps.satellites.isValid() ? (unsigned long) gps.satellites.value() : 0UL;

  unsigned long sec = millis() / 1000UL;
  Serial.printf("[time]   %02lu:%02lu since power-up\n", sec / 60, sec % 60);
  Serial.printf("[sats]   in view=%d  heard with signal=%d  strong(>=25)=%d  strongest=%d dB-Hz  used in fix=%lu\n",
                inView, heard, strong, best, used);

  if (gps.location.isValid()) {
    if (firstFixMs == 0) firstFixMs = millis();
    Serial.printf("[fix]    %.6f, %.6f  hdop=%.1f\n",
                  gps.location.lat(), gps.location.lng(),
                  gps.hdop.isValid() ? gps.hdop.hdop() : 99.0);
    Serial.printf("[RESULT] GPS WORKING - first fix after %lu s\n", firstFixMs / 1000UL);
  } else {
    Serial.println("[fix]    none yet");
    if (heard == 0) {
      Serial.println("[RESULT] hearing no satellites - normal indoors or under a roof; "
                     "move outside / to an open window, antenna flat and facing the sky");
    } else if (best < 20 || strong == 0) {
      Serial.println("[RESULT] ANTENNA WORKS (satellites heard) but signals are weak - more open sky needed");
    } else if (heard < 4) {
      Serial.println("[RESULT] ANTENNA WORKS, good signals - need about 4 satellites; keep it still");
    } else {
      Serial.println("[RESULT] good signals from 4+ satellites - a position fix should arrive within a minute or two");
    }
  }

  if (gps.date.isValid() && gps.time.isValid() && gps.date.year() >= 2024) {
    Serial.printf("[time]   %04d-%02d-%02d %02d:%02d:%02d UTC\n",
                  gps.date.year(), gps.date.month(), gps.date.day(),
                  gps.time.hour(), gps.time.minute(), gps.time.second());
  }
}
