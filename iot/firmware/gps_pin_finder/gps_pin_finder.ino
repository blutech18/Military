/*
 * ArmoryDB · GPS pin finder
 * =========================
 * Finds which ESP32 pin the GPS module's TX wire is really plugged into. Serial Monitor: 115200 baud.
 *
 * It listens for GPS data (NMEA sentences at 9600 baud) on every usable pin in turn. Use it when
 * the wiring test sees nothing even though "everything is plugged in": a plug that landed one
 * hole over shows up here as data arriving on the wrong pin.
 *
 *   Found on GPIO18 -> wiring is right, the problem is elsewhere
 *   Found on another pin -> move the GPS TX wire to D18
 *   Found nowhere -> the GPS is not powered or not transmitting (check VCC, GND, power LED)
 */
#include <HardwareSerial.h>

/* Usable inputs. Left out: 1/3 (USB serial), 6-11 (flash). 34-39 are input-only, which is fine here. */
static const int PINS[] = {4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39, 0, 2};
static const int PIN_COUNT = sizeof(PINS) / sizeof(PINS[0]);
static const uint32_t GPS_BAUD = 9600;
static const unsigned long LISTEN_MS = 1300; /* the GPS sends a burst every second */

HardwareSerial GPSSerial(2);

/* Counts bytes and NMEA starts ("$GP..."), which random noise will not produce. */
struct Result {
  unsigned bytes = 0;
  unsigned nmea = 0;
};

Result listenOn(int pin) {
  Result r;
  GPSSerial.end();
  GPSSerial.begin(GPS_BAUD, SERIAL_8N1, pin, -1);
  unsigned long start = millis();
  int prev = 0, prev2 = 0;
  while (millis() - start < LISTEN_MS) {
    while (GPSSerial.available()) {
      int c = GPSSerial.read();
      r.bytes++;
      if (prev2 == '$' && prev == 'G' && (c == 'P' || c == 'N')) r.nmea++;
      prev2 = prev;
      prev = c;
    }
    delay(2);
  }
  GPSSerial.end();
  return r;
}

void setup() {
  Serial.begin(115200);
  delay(400);
  Serial.println("\n=== GPS pin finder ===");
  Serial.println("Listening for GPS data on every pin, one after another...");
}

void loop() {
  int found = -1;
  unsigned foundCount = 0;

  Serial.println("------------------------------------------------------------");
  for (int i = 0; i < PIN_COUNT; i++) {
    Result r = listenOn(PINS[i]);
    if (r.nmea >= 2) {
      Serial.printf("GPIO%-2d  GPS DATA  (%u bytes, %u sentences)\n", PINS[i], r.bytes, r.nmea);
      if (r.nmea > foundCount) {
        found = PINS[i];
        foundCount = r.nmea;
      }
    } else if (r.bytes > 3) {
      Serial.printf("GPIO%-2d  noise only (%u bytes, no GPS sentences)\n", PINS[i], r.bytes);
    }
  }

  Serial.println();
  if (found == 18) {
    Serial.println("[RESULT] GPS data arrives on GPIO18 - the TX wire is on the right pin (D18).");
  } else if (found >= 0) {
    Serial.printf("[RESULT] GPS data arrives on GPIO%d, not GPIO18. Move the GPS TX wire to D18 "
                  "(or tell me and I will change the pin in config.h).\n", found);
  } else {
    Serial.println("[RESULT] No GPS data on ANY pin. The GPS is not transmitting: it has no power "
                   "(VCC / GND wire) or its TX wire is not touching anything. Check the red power LED.");
  }
}
