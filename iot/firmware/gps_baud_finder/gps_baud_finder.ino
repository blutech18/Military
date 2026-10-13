/*
 * ArmoryDB · GPS baud finder
 * ==========================
 * Finds the speed (baud rate) and format the GPS module talks in. Serial Monitor: 115200 baud.
 * Use it when the tracker says "GARBLED data": bytes arrive on D18 but at the wrong speed.
 * Drone-style NEO-M8N boards often ship at 38400 / 57600 / 115200, some in binary UBX only.
 *
 *   GPS TX -> ESP32 D18, GPS RX -> ESP32 D19 (as in the tracker)
 *
 * For each speed it counts NMEA sentence starts ("$GP", "$GN", ...) and UBX binary headers
 * (0xB5 0x62). The speed with many of either is the module's speed.
 */
#include <HardwareSerial.h>

static const int RX_PIN = 18;
static const int TX_PIN = 19;
static const uint32_t BAUDS[] = {9600, 38400, 57600, 115200, 19200, 4800, 230400};
static const int BAUD_COUNT = sizeof(BAUDS) / sizeof(BAUDS[0]);
static const unsigned long LISTEN_MS = 2200;

HardwareSerial GPSSerial(2);

struct Result {
  unsigned bytes = 0;
  unsigned nmea = 0;
  unsigned ubx = 0;
  String sample;
};

Result listenAt(uint32_t baud) {
  Result r;
  GPSSerial.end();
  GPSSerial.begin(baud, SERIAL_8N1, RX_PIN, TX_PIN);
  delay(50);
  while (GPSSerial.available()) GPSSerial.read(); /* drop bytes from the switch */
  unsigned long start = millis();
  int prev = 0, prev2 = 0;
  while (millis() - start < LISTEN_MS) {
    while (GPSSerial.available()) {
      int c = GPSSerial.read();
      r.bytes++;
      if (prev2 == '$' && prev == 'G') r.nmea++;
      if (prev == 0xB5 && c == 0x62) r.ubx++;
      if (r.sample.length() < 70 && c >= 32 && c < 127) r.sample += (char) c;
      prev2 = prev;
      prev = c;
    }
    delay(2);
  }
  return r;
}

void setup() {
  Serial.begin(115200);
  delay(400);
  Serial.println("\n=== GPS baud finder ===");
}

void loop() {
  uint32_t best = 0;
  unsigned bestScore = 0;
  bool bestUbxOnly = false;

  Serial.println("------------------------------------------------------------");
  for (int i = 0; i < BAUD_COUNT; i++) {
    Result r = listenAt(BAUDS[i]);
    Serial.printf("%6lu baud: %4u bytes, %3u NMEA, %3u UBX   %s\n", (unsigned long) BAUDS[i], r.bytes, r.nmea,
                  r.ubx, r.nmea >= 2 ? r.sample.c_str() : "");
    unsigned score = r.nmea + r.ubx;
    if (score >= 2 && score > bestScore) {
      bestScore = score;
      best = BAUDS[i];
      bestUbxOnly = r.nmea < 2;
    }
  }
  Serial.println();
  if (!best) {
    Serial.println("[RESULT] No readable GPS data at any speed: check the TX -> D18 and GND wires.");
  } else if (bestUbxOnly) {
    Serial.printf("[RESULT] GPS talks at %lu baud in binary UBX only (no NMEA text): it needs reconfiguring.\n",
                  (unsigned long) best);
  } else {
    Serial.printf("[RESULT] GPS talks NMEA at %lu baud.\n", (unsigned long) best);
  }
}
